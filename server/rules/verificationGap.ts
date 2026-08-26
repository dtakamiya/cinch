import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { perfect, scaleUp, type Rule, type RuleResult } from "./types.js";

export const verificationGapRule: Rule = {
  id: "verification-gap",
  category: "practice",
  weight: WEIGHTS["verification-gap"],
  label: "変更後の検証",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.editCalls < THRESHOLDS.verificationGap.minEdits) {
      return perfect(
        `ファイルの変更が ${m.editCalls} 回のため判定対象外です。`,
      );
    }

    const ratio = m.verificationCalls / m.editCalls;
    const score = scaleUp(
      ratio,
      THRESHOLDS.verificationGap.zeroBelow,
      THRESHOLDS.verificationGap.perfectAbove,
    );

    if (score === 1) {
      return perfect(
        `ファイルを ${m.editCalls} 回変更し、テストやビルドなどの検証を ${m.verificationCalls} 回実行しています。`,
      );
    }

    const evidence =
      m.verificationCalls === 0
        ? `ファイルを ${m.editCalls} 回変更しましたが、テストやビルドなどの検証コマンドを 1 度も実行していません。`
        : `ファイルの変更 ${m.editCalls} 回に対して、検証コマンドの実行が ${m.verificationCalls} 回にとどまっています。`;

    return {
      score,
      evidence,
      advice:
        "変更を「完了」と報告する前に、テストやビルド、型チェックを実行して出力を確認してください。検証を通していない変更は、動くという推測にすぎません。変更したファイルに対応するテストを走らせる、あるいは npm test / typecheck のような既存の検証コマンドを区切りごとに挟むと、誤りを早い段階で捕まえられます。",
    };
  },
};
