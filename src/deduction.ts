import { RULE_LABELS, formatScore } from "./format.js";

/** 一覧・詳細で共通に使う「最大の失点」1 件の表示用データ。 */
export interface DeductionView {
  /** ルール ID。 */
  id: string;
  /** 表示ラベル。RULE_LABELS に無ければ ID をそのまま返す。 */
  label: string;
  /** 失った点数（絶対額）。 */
  lost: number;
  /** `−N` 形式の整形済み文字列（例: "−9"）。 */
  lostLabel: string;
}

/**
 * セッションの「最大の失点」1 件を表示用に整形する。
 *
 * ここでいう最大の失点は `max - earned` の絶対額が最大のルール（score.ts が
 * topDeduction / score.rules[0] として既に降順で用意している前提）。
 * 「伸びしろ」ではなく「今どこで一番点を失っているか」を表す。
 *
 * topDeduction が null（減点なし）のときは null を返す。呼び出し側は
 * 従来どおり `—` を表示すればよい。
 */
export function toDeductionView(
  topDeduction: { id: string; lost: number } | null,
): DeductionView | null {
  if (topDeduction === null) return null;
  const { id, lost } = topDeduction;
  return {
    id,
    label: RULE_LABELS[id] ?? id,
    lost,
    lostLabel: `−${formatScore(lost)}`,
  };
}

/**
 * 詳細画面『次に効く改善』ブロック用。失点降順に並んだ score.rules の先頭を、
 * gradable かつ「満点でない」ときだけ表示用データにして返す。
 * 条件を満たさなければ null（ブロックを出さない）。
 *
 * `rules[0]` を「最大の失点」として扱う。この降順は server/score.ts の
 * `computeScore` が保証する契約（SessionScore.rules の JSDoc・score.test.ts の
 * 不変条件テスト参照。cinch-015）。
 */
export function toNextActionView(
  gradable: boolean,
  rules: readonly {
    id: string;
    earned: number;
    max: number;
    evidence: string;
    advice: string | null;
  }[],
): {
  id: string;
  label: string;
  lost: number;
  lostLabel: string;
  body: string;
} | null {
  if (!gradable) return null;
  // score.ts が失点降順を保証しているので rules[0] が最大の失点（cinch-015）
  const top = rules[0];
  if (top === undefined) return null;
  if (top.earned >= top.max) return null;

  const lost = top.max - top.earned;
  return {
    id: top.id,
    label: RULE_LABELS[top.id] ?? top.id,
    lost,
    lostLabel: `−${formatScore(lost)}`,
    body: top.advice ?? top.evidence,
  };
}
