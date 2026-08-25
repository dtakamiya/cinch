import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { pct, perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

export const modelFitRule: Rule = {
  id: "model-fit",
  category: "cost",
  weight: WEIGHTS["model-fit"],
  label: "モデルの選択",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.simpleWorkTurns === 0) {
      return perfect("読み取りのみで完結したターンが無いため判定対象外です。");
    }

    const ratio = m.simpleWorkOnExpensiveModel / m.simpleWorkTurns;
    const score = scaleDown(
      ratio,
      THRESHOLDS.modelFit.perfectBelow,
      THRESHOLDS.modelFit.zeroAbove,
    );
    const evidence = `読み取り系ツールのみで完結したターン ${m.simpleWorkTurns} 回のうち ${m.simpleWorkOnExpensiveModel} 回を高コストモデルで実行（${pct(ratio)}）。`;

    if (score === 1) return perfect(evidence);
    return {
      score,
      evidence,
      advice:
        "Read / Grep / Bash だけで終わるターンに高コストモデルを使っています。単純な情報収集や機械的な変換は軽量モデルのサブエージェントに委譲するか、作業前にモデルを切り替えてください。",
    };
  },
};
