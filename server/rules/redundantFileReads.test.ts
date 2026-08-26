import { describe, expect, it } from "vitest";
import { redundantFileReadsRule } from "./redundantFileReads.js";
import { metricsFixture } from "./testHelpers.js";

describe("redundant-file-reads", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(redundantFileReadsRule.id).toBe("redundant-file-reads");
    expect(redundantFileReadsRule.category).toBe("productivity");
    expect(redundantFileReadsRule.weight).toBe(6);
  });

  it("0 回（満点閾値ちょうど）で満点", () => {
    const r = redundantFileReadsRule.evaluate(metricsFixture({ redundantReads: 0 }));
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("1 回（満点閾値の上）で減点される", () => {
    const r = redundantFileReadsRule.evaluate(metricsFixture({ redundantReads: 1 }));
    expect(r.score).toBeLessThan(1);
    expect(r.score).toBeGreaterThan(0);
    expect(r.advice).not.toBeNull();
  });

  it("6 回（0 点閾値ちょうど）で 0 点", () => {
    const r = redundantFileReadsRule.evaluate(metricsFixture({ redundantReads: 6 }));
    expect(r.score).toBe(0);
  });

  it("10 回（0 点閾値の上）でも 0 点", () => {
    const r = redundantFileReadsRule.evaluate(metricsFixture({ redundantReads: 10 }));
    expect(r.score).toBe(0);
  });

  it("3 回（中間）で 0.5 付近", () => {
    const r = redundantFileReadsRule.evaluate(metricsFixture({ redundantReads: 3 }));
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("evidence に回数を含める", () => {
    const r = redundantFileReadsRule.evaluate(metricsFixture({ redundantReads: 5 }));
    expect(r.evidence).toContain("5");
  });
});
