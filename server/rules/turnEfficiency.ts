import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { perfect, scaleUp, type Rule, type RuleResult } from "./types.js";

export const turnEfficiencyRule: Rule = {
  id: "turn-efficiency",
  category: "productivity",
  weight: WEIGHTS["turn-efficiency"],
  label: "ターンあたりの生産量",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.assistantTurns < THRESHOLDS.turnEfficiency.minTurns) {
      return perfect(
        `assistant ターンが ${m.assistantTurns} 回のため判定対象外です。`,
      );
    }

    const perTurn = m.totals.output / m.assistantTurns;
    const score = scaleUp(
      perTurn,
      THRESHOLDS.turnEfficiency.zeroBelow,
      THRESHOLDS.turnEfficiency.perfectAbove,
    );
    const evidence = `assistant ターン ${m.assistantTurns} 回、出力合計 ${m.totals.output.toLocaleString()} トークン（1 ターンあたり ${Math.round(perTurn)} トークン）。`;

    if (score === 1) return perfect(evidence);
    return {
      score,
      evidence,
      advice:
        "1 ターンあたりの出力が小さく、往復ばかり増えている状態です。ツールを 1 件ずつ呼んで結果を眺めるのではなく、独立した呼び出しをまとめ、次に何をするかを決めてから動いてください。空回りが続くときは、いま何が分かっていて何が分かっていないかを整理し直すのが早道です。",
    };
  },
};
