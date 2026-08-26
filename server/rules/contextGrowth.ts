import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

export const contextGrowthRule: Rule = {
  id: "context-growth",
  category: "practice",
  weight: WEIGHTS["context-growth"],
  label: "コンテキストの肥大",
  evaluate(m: SessionMetrics): RuleResult {
    const series = m.contextGrowth;
    if (series.length < THRESHOLDS.contextGrowth.minTurns) {
      return perfect(
        `計測できたターンが ${series.length} 回のため判定対象外です。`,
      );
    }

    const first = series[0];
    const last = series[series.length - 1];
    if (first === undefined || last === undefined) {
      return perfect("コンテキストの推移が記録されていないため判定対象外です。");
    }

    // 全体の増加量をターン数で割った平均傾き
    const perTurn = (last - first) / (series.length - 1);
    const score = scaleDown(
      perTurn,
      THRESHOLDS.contextGrowth.perfectBelow,
      THRESHOLDS.contextGrowth.zeroAbove,
    );
    const evidence = `コンテキストが ${first.toLocaleString()} → ${last.toLocaleString()} トークンに推移（1 ターンあたり ${Math.round(perTurn).toLocaleString()} トークン増）。`;

    if (score === 1) return perfect(evidence);
    return {
      score,
      evidence,
      advice:
        "コンテキストが急に肥大しています。大きなファイルを丸ごと読む代わりに範囲を絞り、長い出力を伴うコマンドはサブエージェントに任せて結論だけ受け取ってください。作業の区切りで /clear するか、話題が変わるタイミングでセッションを分けるのも有効です。",
    };
  },
};
