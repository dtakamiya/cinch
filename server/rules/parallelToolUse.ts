import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { pct, perfect, scaleUp, type Rule, type RuleResult } from "./types.js";

export const parallelToolUseRule: Rule = {
  id: "parallel-tool-use",
  category: "productivity",
  weight: WEIGHTS["parallel-tool-use"],
  label: "ツール呼び出しの並列化",
  evaluate(m: SessionMetrics): RuleResult {
    // 判定できないケースは減点しない（誤検知より検出漏れを許容する方針）
    if (
      m.parallelizableOpportunities < THRESHOLDS.parallelToolUse.minOpportunities
    ) {
      return perfect(
        "独立と判定できるツール呼び出しが少ないため判定対象外です。",
      );
    }

    const parallelized =
      m.parallelizableOpportunities - m.parallelizableSequences;
    const rate = parallelized / m.parallelizableOpportunities;
    const score = scaleUp(
      rate,
      THRESHOLDS.parallelToolUse.zeroBelow,
      THRESHOLDS.parallelToolUse.perfectAbove,
    );
    const evidence = `読み取り専用ツールのみのターン ${m.parallelizableOpportunities} 回のうち ${m.parallelizableSequences} 回が 1 件ずつの逐次実行（並列化率 ${pct(rate)}）。`;

    if (score === 1) return perfect(evidence);
    return {
      score,
      evidence,
      advice:
        "依存関係のない Read / Grep / Glob は 1 つのメッセージにまとめて呼び出せます。往復回数がそのまま待ち時間になるので、次に何を読むかが前の結果に依存しない場合はまとめてください。",
    };
  },
};
