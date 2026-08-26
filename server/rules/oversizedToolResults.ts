import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

export const oversizedToolResultsRule: Rule = {
  id: "oversized-tool-results",
  category: "productivity",
  weight: WEIGHTS["oversized-tool-results"],
  label: "巨大なツール結果",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.toolCalls < THRESHOLDS.oversizedToolResults.minCalls) {
      return perfect(
        `ツール呼び出しが ${m.toolCalls} 回のため判定対象外です。`,
      );
    }

    const score = scaleDown(
      m.oversizedResults,
      THRESHOLDS.oversizedToolResults.perfectAtMost,
      THRESHOLDS.oversizedToolResults.zeroAtLeast,
    );

    if (score === 1) {
      return perfect("1 回で 12KB を超えるツール結果はありません。");
    }

    const kb = Math.round(m.largestResultBytes / 1024);
    const detail =
      m.largestResultTool === null
        ? `（最大 ${kb}KB）`
        : `（最大 ${kb}KB、${m.largestResultTool}）`;
    const evidence = `1 回で 12KB を超えるツール結果が ${m.oversizedResults} 回${detail}。`;

    return {
      score,
      evidence,
      advice:
        "1 回のツール呼び出しで大量のテキストを取り込むと、その全文が以降のターンで文脈に載り続けます。Read は offset / limit で必要な範囲だけ、Bash の出力は head や grep で絞ってください。ページ全文の取得や広い範囲の調査は、サブエージェントに任せて結論だけ受け取ると文脈が膨らみません。",
    };
  },
};
