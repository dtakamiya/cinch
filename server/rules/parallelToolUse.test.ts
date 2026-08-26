import { describe, expect, it } from "vitest";
import { parallelToolUseRule } from "./parallelToolUse.js";
import { metricsFixture } from "./testHelpers.js";

describe("parallel-tool-use", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(parallelToolUseRule.id).toBe("parallel-tool-use");
    expect(parallelToolUseRule.category).toBe("productivity");
    expect(parallelToolUseRule.weight).toBe(6);
  });

  it("並列化の機会が閾値未満（2 回）なら判定せず満点", () => {
    const r = parallelToolUseRule.evaluate(
      metricsFixture({ parallelizableOpportunities: 2, parallelizableSequences: 2 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("すべてまとめられていれば満点", () => {
    const r = parallelToolUseRule.evaluate(
      metricsFixture({ parallelizableOpportunities: 10, parallelizableSequences: 0 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("並列化率 80%（満点閾値ちょうど）で満点", () => {
    const r = parallelToolUseRule.evaluate(
      metricsFixture({ parallelizableOpportunities: 10, parallelizableSequences: 2 }),
    );
    expect(r.score).toBe(1);
  });

  it("並列化率 20%（0 点閾値ちょうど）で 0 点", () => {
    const r = parallelToolUseRule.evaluate(
      metricsFixture({ parallelizableOpportunities: 10, parallelizableSequences: 8 }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("すべて逐次実行（並列化率 0%）でも 0 点", () => {
    const r = parallelToolUseRule.evaluate(
      metricsFixture({ parallelizableOpportunities: 10, parallelizableSequences: 10 }),
    );
    expect(r.score).toBe(0);
  });

  it("並列化率 50%（中間）で 0.5 付近", () => {
    const r = parallelToolUseRule.evaluate(
      metricsFixture({ parallelizableOpportunities: 10, parallelizableSequences: 5 }),
    );
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("evidence に逐次実行の回数を含める", () => {
    const r = parallelToolUseRule.evaluate(
      metricsFixture({ parallelizableOpportunities: 10, parallelizableSequences: 5 }),
    );
    expect(r.evidence).toContain("5");
  });
});
