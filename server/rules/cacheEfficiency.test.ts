import { describe, expect, it } from "vitest";
import { cacheEfficiencyRule } from "./cacheEfficiency.js";
import { metricsFixture } from "./testHelpers.js";

describe("cache-efficiency", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(cacheEfficiencyRule.id).toBe("cache-efficiency");
    expect(cacheEfficiencyRule.category).toBe("cost");
    expect(cacheEfficiencyRule.weight).toBe(12);
  });

  it("ヒット率 90%（満点閾値ちょうど）で満点", () => {
    // cacheRead 9000 / (9000 + input 500 + cacheCreate 500) = 0.9
    const r = cacheEfficiencyRule.evaluate(
      metricsFixture({ totals: { cacheRead: 9000, input: 500, cacheCreate: 500 } }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("満点閾値の上（95%）でも満点", () => {
    const r = cacheEfficiencyRule.evaluate(
      metricsFixture({ totals: { cacheRead: 9500, input: 250, cacheCreate: 250 } }),
    );
    expect(r.score).toBe(1);
  });

  it("ヒット率 30%（0 点閾値ちょうど）で 0 点", () => {
    const r = cacheEfficiencyRule.evaluate(
      metricsFixture({ totals: { cacheRead: 3000, input: 3500, cacheCreate: 3500 } }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("0 点閾値の下（10%）でも 0 点", () => {
    const r = cacheEfficiencyRule.evaluate(
      metricsFixture({ totals: { cacheRead: 1000, input: 4500, cacheCreate: 4500 } }),
    );
    expect(r.score).toBe(0);
  });

  it("中間（60%）で 0.5 付近", () => {
    const r = cacheEfficiencyRule.evaluate(
      metricsFixture({ totals: { cacheRead: 6000, input: 2000, cacheCreate: 2000 } }),
    );
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("evidence にヒット率を含める", () => {
    const r = cacheEfficiencyRule.evaluate(
      metricsFixture({ totals: { cacheRead: 6000, input: 2000, cacheCreate: 2000 } }),
    );
    expect(r.evidence).toContain("60.0%");
  });

  it("トークンが 0 のセッションは判定せず満点（ゼロ除算を避ける）", () => {
    const r = cacheEfficiencyRule.evaluate(metricsFixture());
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });
});
