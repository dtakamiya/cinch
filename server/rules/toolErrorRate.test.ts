import { describe, expect, it } from "vitest";
import { toolErrorRateRule } from "./toolErrorRate.js";
import { metricsFixture } from "./testHelpers.js";

describe("tool-error-rate", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(toolErrorRateRule.id).toBe("tool-error-rate");
    expect(toolErrorRateRule.category).toBe("productivity");
    expect(toolErrorRateRule.weight).toBe(9);
  });

  it("ツール呼び出しが閾値未満（4 回）なら判定せず満点", () => {
    const r = toolErrorRateRule.evaluate(
      metricsFixture({ toolCalls: 4, toolErrors: 4 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("エラー率 4%（満点閾値の下）で満点", () => {
    const r = toolErrorRateRule.evaluate(
      metricsFixture({ toolCalls: 100, toolErrors: 4 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("エラー率 5%（満点閾値ちょうど）で満点", () => {
    const r = toolErrorRateRule.evaluate(
      metricsFixture({ toolCalls: 100, toolErrors: 5 }),
    );
    expect(r.score).toBe(1);
  });

  it("エラー率 25%（0 点閾値ちょうど）で 0 点", () => {
    const r = toolErrorRateRule.evaluate(
      metricsFixture({ toolCalls: 100, toolErrors: 25 }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("エラー率 40%（0 点閾値の上）でも 0 点", () => {
    const r = toolErrorRateRule.evaluate(
      metricsFixture({ toolCalls: 100, toolErrors: 40 }),
    );
    expect(r.score).toBe(0);
  });

  it("エラー率 15%（中間）で 0.5 付近", () => {
    const r = toolErrorRateRule.evaluate(
      metricsFixture({ toolCalls: 100, toolErrors: 15 }),
    );
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("evidence に呼び出し回数・失敗回数・比率を含める", () => {
    const r = toolErrorRateRule.evaluate(
      metricsFixture({ toolCalls: 47, toolErrors: 12 }),
    );
    expect(r.evidence).toContain("47");
    expect(r.evidence).toContain("12");
    expect(r.evidence).toContain("25.5%");
  });

  it("advice に最もエラーの多いツール名を含める", () => {
    const r = toolErrorRateRule.evaluate(
      metricsFixture({
        toolCalls: 40,
        toolErrors: 12,
        toolsByName: {
          Bash: { calls: 20, errors: 10 },
          Read: { calls: 20, errors: 2 },
        },
      }),
    );
    expect(r.advice).toContain("Bash");
  });
});
