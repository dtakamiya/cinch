import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { pct, perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

/** 最もエラー件数の多いツール名を返す。同数なら名前順で最初のもの。 */
function worstTool(m: SessionMetrics): string | null {
  let name: string | null = null;
  let worst = 0;
  for (const key of Object.keys(m.toolsByName).sort()) {
    const entry = m.toolsByName[key];
    if (entry === undefined) continue;
    if (entry.errors > worst) {
      worst = entry.errors;
      name = key;
    }
  }
  return name;
}

export const toolErrorRateRule: Rule = {
  id: "tool-error-rate",
  category: "productivity",
  weight: WEIGHTS["tool-error-rate"],
  label: "ツールエラー率",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.toolCalls < THRESHOLDS.toolErrorRate.minCalls) {
      return perfect(
        `ツール呼び出しが ${m.toolCalls} 回のため判定対象外です。`,
      );
    }

    const rate = m.toolErrors / m.toolCalls;
    const score = scaleDown(
      rate,
      THRESHOLDS.toolErrorRate.perfectBelow,
      THRESHOLDS.toolErrorRate.zeroAbove,
    );
    const evidence = `ツール呼び出し ${m.toolCalls} 回中 ${m.toolErrors} 回が失敗（${pct(rate)}）。`;

    if (score === 1) return perfect(evidence);

    const worst = worstTool(m);
    const detail =
      worst !== null
        ? `失敗が最も多いのは ${worst} です。`
        : "";
    return {
      score,
      evidence,
      advice: `${detail}実行前に引数を確認してください。ファイルパスは推測せず Glob や Grep で存在を確かめてから渡し、Edit の前には対象ファイルを Read しておくと失敗が減ります。同じ失敗を 2 回繰り返したら、やり方を変える合図です。`,
    };
  },
};
