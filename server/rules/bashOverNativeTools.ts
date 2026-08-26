import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { pct, perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

/** 多い順に上位 3 件を "cat 5 回 / ls 3 回" の形にする */
function breakdown(byCommand: Record<string, number>): string {
  const top = Object.entries(byCommand)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name, count]) => `${name} ${count} 回`);
  return top.join(" / ");
}

export const bashOverNativeToolsRule: Rule = {
  id: "bash-over-native-tools",
  category: "productivity",
  weight: WEIGHTS["bash-over-native-tools"],
  label: "専用ツールの代わりに Bash",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.toolCalls < THRESHOLDS.bashOverNativeTools.minCalls) {
      return perfect(
        `ツール呼び出しが ${m.toolCalls} 回のため判定対象外です。`,
      );
    }

    const ratio = m.bashInsteadOfTool / m.toolCalls;
    const score = scaleDown(
      ratio,
      THRESHOLDS.bashOverNativeTools.perfectBelow,
      THRESHOLDS.bashOverNativeTools.zeroAbove,
    );

    if (score === 1) {
      return perfect(
        "ファイルの読み取りや検索に、Bash ではなく専用ツールを使えています。",
      );
    }

    const detail = breakdown(m.bashInsteadOfToolByCommand);
    const evidence =
      `ツール呼び出し ${m.toolCalls} 回のうち ${m.bashInsteadOfTool} 回（${pct(ratio)}）が、` +
      `専用ツールで代替できる Bash でした（${detail}）。`;

    return {
      score,
      evidence,
      advice:
        "cat / head / tail / sed はファイル内容の取得なので Read、grep / rg は Grep、find / ls はファイル探索なので Glob が使えます。専用ツールは結果が構造化されていて行番号が付き、余計なシェル出力が文脈に載りません。Bash は、実際にコマンドを実行する必要があるとき（テスト、ビルド、git 操作など）に取っておいてください。",
    };
  },
};
