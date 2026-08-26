import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { pct, perfect, scaleUp, type Rule, type RuleResult } from "./types.js";

export const subagentDelegationRule: Rule = {
  id: "subagent-delegation",
  category: "practice",
  weight: WEIGHTS["subagent-delegation"],
  label: "サブエージェントへの委譲",
  evaluate(m: SessionMetrics): RuleResult {
    // 探索が軽いセッションでは委譲の要否を判定できないので減点しない
    if (
      m.heavyExplorationTurns < THRESHOLDS.subagentDelegation.minHeavyTurns ||
      m.assistantTurns === 0
    ) {
      return perfect(
        `大量出力を伴う探索が ${m.heavyExplorationTurns} ターンのため判定対象外です。`,
      );
    }

    const rate = m.sidechainTurns / m.assistantTurns;
    const score = scaleUp(
      rate,
      THRESHOLDS.subagentDelegation.zeroBelow,
      THRESHOLDS.subagentDelegation.perfectAbove,
    );
    const evidence = `読み取り系ツールを多用した探索が ${m.heavyExplorationTurns} ターン。全 ${m.assistantTurns} ターン中 ${m.sidechainTurns} ターンがサブエージェント（委譲率 ${pct(rate)}）。`;

    if (score === 1) return perfect(evidence);
    return {
      score,
      evidence,
      advice:
        "大量の出力を伴う探索をメインセッションで直接行うと、その出力がすべて文脈に積み上がります。複数ファイル・複数ディレクトリにまたがる調査や、結論だけあればよい情報収集はサブエージェントに委譲してください。委譲時は探索範囲と期待する成果物の形式を明示すると、戻ってくる結果が使いやすくなります。",
    };
  },
};
