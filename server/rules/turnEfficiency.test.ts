import { describe, expect, it } from "vitest";
import { turnEfficiencyRule } from "./turnEfficiency.js";
import { metricsFixture } from "./testHelpers.js";

describe("turn-efficiency", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(turnEfficiencyRule.id).toBe("turn-efficiency");
    expect(turnEfficiencyRule.category).toBe("productivity");
    expect(turnEfficiencyRule.weight).toBe(7);
  });

  it("ターン数が閾値未満（4）なら判定せず満点", () => {
    const r = turnEfficiencyRule.evaluate(
      metricsFixture({ assistantTurns: 4, totals: { output: 40 } }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("1 ターンあたり 300 トークン（満点閾値ちょうど）で満点", () => {
    const r = turnEfficiencyRule.evaluate(
      metricsFixture({ assistantTurns: 10, totals: { output: 3000 } }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("1 ターンあたり 500 トークン（満点閾値の上）でも満点", () => {
    const r = turnEfficiencyRule.evaluate(
      metricsFixture({ assistantTurns: 10, totals: { output: 5000 } }),
    );
    expect(r.score).toBe(1);
  });

  it("1 ターンあたり 60 トークン（0 点閾値ちょうど）で 0 点", () => {
    const r = turnEfficiencyRule.evaluate(
      metricsFixture({ assistantTurns: 10, totals: { output: 600 } }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("1 ターンあたり 20 トークン（0 点閾値の下）でも 0 点", () => {
    const r = turnEfficiencyRule.evaluate(
      metricsFixture({ assistantTurns: 10, totals: { output: 200 } }),
    );
    expect(r.score).toBe(0);
  });

  it("1 ターンあたり 180 トークン（中間）で 0.5 付近", () => {
    const r = turnEfficiencyRule.evaluate(
      metricsFixture({ assistantTurns: 10, totals: { output: 1800 } }),
    );
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("evidence にターン数と 1 ターンあたりの出力を含める", () => {
    const r = turnEfficiencyRule.evaluate(
      metricsFixture({ assistantTurns: 10, totals: { output: 1800 } }),
    );
    expect(r.evidence).toContain("10");
    expect(r.evidence).toContain("180");
  });
});
