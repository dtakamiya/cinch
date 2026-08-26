import { describe, expect, it } from "vitest";
import { contextGrowthRule } from "./contextGrowth.js";
import { metricsFixture } from "./testHelpers.js";

/** 開始 start から 1 ターンあたり step ずつ増える contextGrowth 配列を作る */
function growth(start: number, step: number, turns: number): number[] {
  return Array.from({ length: turns }, (_, i) => start + step * i);
}

describe("context-growth", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(contextGrowthRule.id).toBe("context-growth");
    expect(contextGrowthRule.category).toBe("practice");
    expect(contextGrowthRule.weight).toBe(8);
  });

  it("ターン数が閾値未満（4）なら判定せず満点", () => {
    const r = contextGrowthRule.evaluate(
      metricsFixture({ contextGrowth: growth(10_000, 50_000, 4) }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("ターンあたり 3000 トークン増（満点閾値ちょうど）で満点", () => {
    const r = contextGrowthRule.evaluate(
      metricsFixture({ contextGrowth: growth(10_000, 3_000, 11) }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("ターンあたり 1000 トークン増（満点閾値の下）でも満点", () => {
    const r = contextGrowthRule.evaluate(
      metricsFixture({ contextGrowth: growth(10_000, 1_000, 11) }),
    );
    expect(r.score).toBe(1);
  });

  it("ターンあたり 20000 トークン増（0 点閾値ちょうど）で 0 点", () => {
    const r = contextGrowthRule.evaluate(
      metricsFixture({ contextGrowth: growth(10_000, 20_000, 11) }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("ターンあたり 40000 トークン増（0 点閾値の上）でも 0 点", () => {
    const r = contextGrowthRule.evaluate(
      metricsFixture({ contextGrowth: growth(10_000, 40_000, 11) }),
    );
    expect(r.score).toBe(0);
  });

  it("ターンあたり 11500 トークン増（中間）で 0.5 付近", () => {
    const r = contextGrowthRule.evaluate(
      metricsFixture({ contextGrowth: growth(10_000, 11_500, 11) }),
    );
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("コンテキストが縮んだ場合（compact 後など）は満点", () => {
    const r = contextGrowthRule.evaluate(
      metricsFixture({ contextGrowth: [100_000, 80_000, 60_000, 40_000, 20_000, 10_000] }),
    );
    expect(r.score).toBe(1);
  });

  it("evidence に最終コンテキストサイズと 1 ターンあたりの増加量を含める", () => {
    const r = contextGrowthRule.evaluate(
      metricsFixture({ contextGrowth: growth(10_000, 11_500, 11) }),
    );
    expect(r.evidence).toContain("11,500");
    expect(r.evidence).toContain("125,000");
  });
});
