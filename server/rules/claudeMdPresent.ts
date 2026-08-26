import type { SessionMetrics } from "../../shared/types.js";
import { WEIGHTS } from "../config/thresholds.js";
import { perfect, type Rule, type RuleResult } from "./types.js";

export const claudeMdPresentRule: Rule = {
  id: "claude-md-present",
  category: "practice",
  weight: WEIGHTS["claude-md-present"],
  label: "CLAUDE.md の有無",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.hasClaudeMd) {
      return perfect(`${m.cwd} に CLAUDE.md があります。`);
    }
    return {
      score: 0,
      evidence: `${m.cwd} に CLAUDE.md がありません。`,
      advice:
        "プロジェクト直下に CLAUDE.md を置くと、ビルド・テストの実行方法、コーディング規約、触ってはいけない場所といった前提を毎回説明せずに済みます。まずは検証コマンドとディレクトリ構成の要点だけでも書いておくと、指示の往復が減ります。",
    };
  },
};
