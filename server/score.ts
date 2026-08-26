import {
  CATEGORIES,
  type Category,
  type EvaluatedRule,
  type SessionMetrics,
  type SessionScore,
} from "../shared/types.js";
import { THRESHOLDS } from "./config/thresholds.js";
import { ALL_RULES } from "./rules/index.js";
import type { Rule } from "./rules/types.js";

/** 小数第 1 位に丸める。浮動小数の誤差が UI に出ないようにするため。 */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function emptyCategories(): Record<Category, { earned: number; max: number }> {
  const out = {} as Record<Category, { earned: number; max: number }>;
  for (const c of CATEGORIES) out[c] = { earned: 0, max: 0 };
  return out;
}

/**
 * 全ルールを評価して重み付け合算する。
 * assistantTurns が閾値未満のセッションは採点対象外とし、gradable: false を返す。
 *
 * 返り値の `rules` は**失点（`max - earned`）の降順でソート済み**であることを保証する。
 * これはドキュメント上の契約であり、UI（src/SessionList.tsx の「主な減点」列、
 * src/SessionDetail.tsx の『次に効く改善』ブロック、src/deduction.ts の
 * `toNextActionView`）が `rules[0]` を「失点が最大のルール」として直接参照している。
 * ソート順を変える場合はこれらの呼び出し側も併せて見直すこと（cinch-015）。
 */
export function computeScore(
  m: SessionMetrics,
  rules: Rule[] = ALL_RULES,
): SessionScore {
  const gradable = m.assistantTurns >= THRESHOLDS.minGradableTurns;

  if (!gradable) {
    return {
      sessionId: m.sessionId,
      total: 0,
      gradable: false,
      categories: emptyCategories(),
      rules: [],
    };
  }

  const categories = emptyCategories();
  const evaluated: EvaluatedRule[] = [];

  for (const rule of rules) {
    const result = rule.evaluate(m);
    const earned = round1(rule.weight * result.score);

    const bucket = categories[rule.category];
    bucket.earned = round1(bucket.earned + earned);
    bucket.max += rule.weight;

    evaluated.push({
      id: rule.id,
      category: rule.category,
      earned,
      max: rule.weight,
      evidence: result.evidence,
      advice: result.advice,
    });
  }

  // 減点の大きい順に並べる（UI で「直すべきもの」が上に来るように）。
  // この降順は SessionScore.rules の契約であり、UI（SessionList / SessionDetail /
  // deduction.ts）が rules[0] を「最大の失点」として参照している。順序を変えるときは
  // 上記の呼び出し側と score.test.ts の不変条件テストを必ず確認すること（cinch-015）。
  evaluated.sort((a, b) => b.max - b.earned - (a.max - a.earned));

  const total = round1(
    evaluated.reduce((sum, r) => sum + r.earned, 0),
  );

  return { sessionId: m.sessionId, total, gradable: true, categories, rules: evaluated };
}

/** 一覧の「主な減点」列に出す、最も減点の大きいルール。 */
export function topDeduction(
  score: SessionScore,
): { id: string; lost: number } | null {
  if (!score.gradable) return null;
  let best: { id: string; lost: number } | null = null;
  for (const r of score.rules) {
    const lost = round1(r.max - r.earned);
    if (lost <= 0) continue;
    if (best === null || lost > best.lost) best = { id: r.id, lost };
  }
  return best;
}
