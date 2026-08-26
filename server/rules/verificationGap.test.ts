import { describe, expect, it } from "vitest";
import { metricsFixture } from "./testHelpers.js";
import { verificationGapRule } from "./verificationGap.js";

describe("verification-gap", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(verificationGapRule.id).toBe("verification-gap");
    expect(verificationGapRule.category).toBe("practice");
    expect(verificationGapRule.weight).toBe(7);
  });

  it("編集が minEdits 未満なら判定対象外で満点", () => {
    const r = verificationGapRule.evaluate(
      metricsFixture({ editCalls: 2, verificationCalls: 0 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
    expect(r.evidence).toContain("判定対象外");
  });

  it("編集 10 回に対し検証 5 回（比 0.5）なら満点", () => {
    const r = verificationGapRule.evaluate(
      metricsFixture({ editCalls: 10, verificationCalls: 5 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("編集はあるが検証 0 回なら 0 点で、evidence が事実を述べる", () => {
    const r = verificationGapRule.evaluate(
      metricsFixture({ editCalls: 8, verificationCalls: 0 }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
    expect(r.evidence).toContain("8");
    expect(r.evidence).toContain("1 度も");
  });

  it("検証が不足していれば部分点になる", () => {
    const r = verificationGapRule.evaluate(
      metricsFixture({ editCalls: 10, verificationCalls: 2 }),
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
    expect(r.advice).not.toBeNull();
  });

  it("検証が編集を上回っても満点を超えない", () => {
    const r = verificationGapRule.evaluate(
      metricsFixture({ editCalls: 3, verificationCalls: 20 }),
    );
    expect(r.score).toBe(1);
  });
});
