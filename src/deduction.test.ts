import { describe, expect, it } from "vitest";
import { toDeductionView, toNextActionView } from "./deduction.js";

describe("toDeductionView", () => {
  it("topDeduction が null なら null を返す", () => {
    expect(toDeductionView(null)).toBeNull();
  });

  it("ラベルが登録されていれば日本語名を解決する", () => {
    const v = toDeductionView({ id: "tool-error-rate", lost: 9 });
    expect(v).toEqual({
      id: "tool-error-rate",
      label: "ツールエラー率",
      lost: 9,
      lostLabel: "−9",
    });
  });

  it("ラベル未登録なら ID をそのまま label に使う", () => {
    const v = toDeductionView({ id: "unknown-rule", lost: 4 });
    expect(v?.label).toBe("unknown-rule");
    expect(v?.lostLabel).toBe("−4");
  });

  it("小数の失点は formatScore に従い第 1 位まで整形する", () => {
    const v = toDeductionView({ id: "tool-error-rate", lost: 3.25 });
    expect(v?.lostLabel).toBe("−3.3");
  });

  it("earned が round1 済みのため実データで来る失点は 0.1 刻み（浮動小数誤差を持ち込まない）", () => {
    // score.ts は earned = round1(weight * score) なので max(整数) - earned は 0.1 の倍数。
    // 12 - 11.9 のような引き算でも表示は破綻しない。
    const v = toDeductionView({ id: "cache-efficiency", lost: 12 - 11.9 });
    expect(v?.lostLabel).toBe("−0.1");
  });

  it("失点 0（呼び出し側 topDeduction が弾く想定だが単体では素通しになる）", () => {
    // topDeduction は lost <= 0 を除外して返すので実データでは 0 は渡らない。
    // ただし関数単体にはガードが無く、−0 表記になることを既知の挙動として固定する。
    const v = toDeductionView({ id: "tool-error-rate", lost: 0 });
    expect(v?.lostLabel).toBe("−0");
  });
});

describe("toNextActionView", () => {
  const rule = (o: Partial<Parameters<typeof toNextActionView>[1][number]> = {}) => ({
    id: "tool-error-rate",
    category: "productivity",
    earned: 2,
    max: 12,
    evidence: "ツール呼び出し 47 回中 12 回が失敗（25.5%）。",
    advice: "Bash の引数を実行前に確認してください。",
    ...o,
  });

  it("gradable が false なら null", () => {
    expect(toNextActionView(false, [rule()])).toBeNull();
  });

  it("ルールが 1 件も無ければ null", () => {
    expect(toNextActionView(true, [])).toBeNull();
  });

  it("先頭ルールが満点なら null", () => {
    expect(toNextActionView(true, [rule({ earned: 12, max: 12 })])).toBeNull();
  });

  it("失点があれば label・lost・lostLabel・body を返す", () => {
    const v = toNextActionView(true, [rule()]);
    expect(v).toEqual({
      id: "tool-error-rate",
      label: "ツールエラー率",
      lost: 10,
      lostLabel: "−10",
      body: "Bash の引数を実行前に確認してください。",
    });
  });

  it("advice が null なら evidence を body にする", () => {
    const v = toNextActionView(true, [rule({ advice: null })]);
    expect(v?.body).toBe("ツール呼び出し 47 回中 12 回が失敗（25.5%）。");
  });

  it("ラベル未登録なら ID をそのまま label に使う", () => {
    const v = toNextActionView(true, [rule({ id: "brand-new-rule" })]);
    expect(v?.label).toBe("brand-new-rule");
  });

  it("advice が null かつ evidence が空文字なら body は空文字になる", () => {
    // ルール実装は evidence を必ず埋める前提だが、関数はそれを保証しない。
    // 空文字がそのまま body に流れる（UI では空の段落になる）ことを既知の挙動として固定。
    const v = toNextActionView(true, [rule({ advice: null, evidence: "" })]);
    expect(v?.body).toBe("");
  });

  it("先頭ルールだけを見る（後続により大きい失点があっても先頭を返す）", () => {
    // score.rules は computeScore が失点降順にソート済み（server/score.ts:65）。
    // toNextActionView はその前提に乗り、rules[0] のみを参照する。
    const v = toNextActionView(true, [
      rule({ id: "tool-error-rate", earned: 8, max: 12 }),
      rule({ id: "cache-efficiency", earned: 0, max: 12 }),
    ]);
    expect(v?.id).toBe("tool-error-rate");
    expect(v?.lost).toBe(4);
  });

  it("earned が round1 済みなら lost に浮動小数誤差を持ち込まない", () => {
    // max(整数) - earned(round1 済み) は 0.1 の倍数。round1 を挟まなくても表示は安定。
    const v = toNextActionView(true, [rule({ earned: 11.9, max: 12 })]);
    expect(v?.lostLabel).toBe("−0.1");
  });

  it("先頭ルールが earned > max（異常データ）でも満点ガードで null", () => {
    // earned >= max なら null。earned が max を超える壊れたデータでも同じ経路で弾かれる。
    const v = toNextActionView(true, [rule({ earned: 15, max: 12 })]);
    expect(v).toBeNull();
  });
});
