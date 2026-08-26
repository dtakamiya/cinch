import { describe, expect, it } from "vitest";
import { contextWindowHeadroomRule } from "./contextWindowHeadroom.js";
import { metricsFixture } from "./testHelpers.js";

describe("context-window-headroom", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(contextWindowHeadroomRule.id).toBe("context-window-headroom");
    expect(contextWindowHeadroomRule.category).toBe("cost");
    expect(contextWindowHeadroomRule.weight).toBe(5);
  });

  it("assistant ターンが minTurns 未満なら判定対象外で満点", () => {
    const r = contextWindowHeadroomRule.evaluate(
      metricsFixture({ assistantTurns: 4, peakContextTokens: 190_000 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
    expect(r.evidence).toContain("判定対象外");
  });

  it("上限の 50% 以下なら満点", () => {
    const r = contextWindowHeadroomRule.evaluate(
      metricsFixture({ assistantTurns: 30, peakContextTokens: 90_000 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("上限の 95% 以上なら 0 点", () => {
    const r = contextWindowHeadroomRule.evaluate(
      metricsFixture({ assistantTurns: 30, peakContextTokens: 195_000 }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("基準を超えても割合の表示は 100% で頭打ちにする（1M 文脈のモデル）", () => {
    const r = contextWindowHeadroomRule.evaluate(
      metricsFixture({ assistantTurns: 30, peakContextTokens: 287_000 }),
    );
    expect(r.score).toBe(0);
    expect(r.evidence).toContain("287k");
    expect(r.evidence).toContain("100.0%");
    expect(r.evidence).not.toContain("143");
  });

  it("中間なら部分点で、evidence にトークン数と割合を出す", () => {
    const r = contextWindowHeadroomRule.evaluate(
      metricsFixture({ assistantTurns: 30, peakContextTokens: 150_000 }),
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
    expect(r.evidence).toContain("150k");
    expect(r.evidence).toContain("75.0%");
  });
});
