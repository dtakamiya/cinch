import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { perfect, type Rule, type RuleResult } from "./types.js";

export const taskPlanningRule: Rule = {
  id: "task-planning",
  category: "practice",
  weight: WEIGHTS["task-planning"],
  label: "タスクの計画",
  evaluate(m: SessionMetrics): RuleResult {
    const todoCalls = m.toolsByName["TodoWrite"]?.calls ?? 0;

    if (
      m.assistantTurns < THRESHOLDS.taskPlanning.minTurns ||
      m.toolCalls < THRESHOLDS.taskPlanning.minCalls
    ) {
      return perfect(
        "計画ツールを要する規模のセッションではないため判定対象外です。",
      );
    }

    if (todoCalls >= 1) {
      return perfect(
        `ツール呼び出し ${m.toolCalls} 回のセッションで TodoWrite を ${todoCalls} 回使用。`,
      );
    }

    return {
      score: 0,
      evidence: `ツール呼び出し ${m.toolCalls} 回・${m.assistantTurns} ターンのセッションで TodoWrite の使用なし。`,
      advice:
        "3 ステップ以上の作業や複数ファイルにまたがる調査は、着手前に TodoWrite でタスクへ分解してください。やることを先に並べると抜け漏れが減り、ユーザーが進捗を追えます。スキルのチェックリストがある場合は 1 項目ずつ todo にすると確実です。",
    };
  },
};
