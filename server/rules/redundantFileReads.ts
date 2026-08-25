import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

export const redundantFileReadsRule: Rule = {
  id: "redundant-file-reads",
  category: "productivity",
  weight: WEIGHTS["redundant-file-reads"],
  label: "冗長なファイル読み込み",
  evaluate(m: SessionMetrics): RuleResult {
    const score = scaleDown(
      m.redundantReads,
      THRESHOLDS.redundantFileReads.perfectAtMost,
      THRESHOLDS.redundantFileReads.zeroAtLeast,
    );
    const evidence =
      m.redundantReads === 0
        ? "編集を挟まない同一ファイルの再読み込みはありません。"
        : `編集を挟まずに同じファイルを読み直した回数 ${m.redundantReads} 回。`;

    if (score === 1) return perfect(evidence);
    return {
      score,
      evidence,
      advice:
        "一度読んだファイルの内容は文脈に残っています。読み直しは文脈を捨てているサインです。ファイルの一部だけが必要なら offset / limit で範囲を絞って読み、編集後の確認のための再読み込みは避けてください（Edit が失敗していなければ変更は適用されています）。",
    };
  },
};
