import { describe, expect, it } from "vitest";
import { cacheTtlWasteRule } from "./cacheTtlWaste.js";
import { metricsFixture } from "./testHelpers.js";

describe("cache-ttl-waste", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(cacheTtlWasteRule.id).toBe("cache-ttl-waste");
    expect(cacheTtlWasteRule.category).toBe("cost");
    expect(cacheTtlWasteRule.weight).toBe(10);
  });

  it("1h キャッシュ作成が閾値未満（1 回）なら判定せず満点", () => {
    const r = cacheTtlWasteRule.evaluate(
      metricsFixture({ cache1hCreations: 1, cacheExpirations: 1 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("失効 0 なら満点", () => {
    const r = cacheTtlWasteRule.evaluate(
      metricsFixture({ cache1hCreations: 10, cacheExpirations: 0 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("失効率 50%（0 点閾値ちょうど）で 0 点", () => {
    const r = cacheTtlWasteRule.evaluate(
      metricsFixture({ cache1hCreations: 10, cacheExpirations: 5 }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("失効率 100%（0 点閾値の上）でも 0 点", () => {
    const r = cacheTtlWasteRule.evaluate(
      metricsFixture({ cache1hCreations: 4, cacheExpirations: 4 }),
    );
    expect(r.score).toBe(0);
  });

  it("失効率 25%（中間）で 0.5 付近", () => {
    const r = cacheTtlWasteRule.evaluate(
      metricsFixture({ cache1hCreations: 8, cacheExpirations: 2 }),
    );
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("evidence に失効回数と作成回数を含める", () => {
    const r = cacheTtlWasteRule.evaluate(
      metricsFixture({ cache1hCreations: 8, cacheExpirations: 2 }),
    );
    expect(r.evidence).toContain("8");
    expect(r.evidence).toContain("2");
  });
});
