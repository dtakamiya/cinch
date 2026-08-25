import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { pct, perfect, scaleUp, type Rule, type RuleResult } from "./types.js";

export const cacheEfficiencyRule: Rule = {
  id: "cache-efficiency",
  category: "cost",
  weight: WEIGHTS["cache-efficiency"],
  label: "キャッシュ効率",
  evaluate(m: SessionMetrics): RuleResult {
    const { cacheRead, input, cacheCreate } = m.totals;
    const denominator = cacheRead + input + cacheCreate;
    if (denominator === 0) {
      return perfect("トークン使用量が記録されていないため判定対象外です。");
    }

    const hitRate = cacheRead / denominator;
    const score = scaleUp(
      hitRate,
      THRESHOLDS.cacheEfficiency.zeroBelow,
      THRESHOLDS.cacheEfficiency.perfectAbove,
    );
    const evidence = `キャッシュヒット率 ${pct(hitRate)}（読み込み ${cacheRead.toLocaleString()} / 全入力 ${denominator.toLocaleString()} トークン）。`;

    if (score === 1) return perfect(evidence);
    return {
      score,
      evidence,
      advice:
        "毎ターン文脈を再送しています。会話の途中でファイルを大量に読み直したり、長い出力をそのまま context に載せたりしていないか確認してください。大量出力を伴う調査はサブエージェントに委譲すると、メインの文脈が安定してキャッシュが効きます。",
    };
  },
};
