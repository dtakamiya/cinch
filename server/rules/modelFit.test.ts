import { describe, expect, it } from "vitest";
import { modelFitRule } from "./modelFit.js";
import { metricsFixture } from "./testHelpers.js";

describe("model-fit", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(modelFitRule.id).toBe("model-fit");
    expect(modelFitRule.category).toBe("cost");
    expect(modelFitRule.weight).toBe(10);
  });

  it("単純作業のターンが 0 なら判定せず満点", () => {
    const r = modelFitRule.evaluate(
      metricsFixture({ simpleWorkTurns: 0, simpleWorkOnExpensiveModel: 0 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("高コストモデル比率 10%（満点閾値ちょうど）で満点", () => {
    const r = modelFitRule.evaluate(
      metricsFixture({ simpleWorkTurns: 20, simpleWorkOnExpensiveModel: 2 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("満点閾値の下（5%）でも満点", () => {
    const r = modelFitRule.evaluate(
      metricsFixture({ simpleWorkTurns: 20, simpleWorkOnExpensiveModel: 1 }),
    );
    expect(r.score).toBe(1);
  });

  it("比率 60%（0 点閾値ちょうど）で 0 点", () => {
    const r = modelFitRule.evaluate(
      metricsFixture({ simpleWorkTurns: 10, simpleWorkOnExpensiveModel: 6 }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("比率 100%（0 点閾値の上）でも 0 点", () => {
    const r = modelFitRule.evaluate(
      metricsFixture({ simpleWorkTurns: 10, simpleWorkOnExpensiveModel: 10 }),
    );
    expect(r.score).toBe(0);
  });

  it("比率 35%（中間）で 0.5 付近", () => {
    const r = modelFitRule.evaluate(
      metricsFixture({ simpleWorkTurns: 20, simpleWorkOnExpensiveModel: 7 }),
    );
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("evidence に比率とターン数を含める", () => {
    const r = modelFitRule.evaluate(
      metricsFixture({ simpleWorkTurns: 20, simpleWorkOnExpensiveModel: 7 }),
    );
    expect(r.evidence).toContain("35.0%");
    expect(r.evidence).toContain("20");
  });
});
