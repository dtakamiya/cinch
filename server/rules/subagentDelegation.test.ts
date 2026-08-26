import { describe, expect, it } from "vitest";
import { subagentDelegationRule } from "./subagentDelegation.js";
import { metricsFixture } from "./testHelpers.js";

describe("subagent-delegation", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(subagentDelegationRule.id).toBe("subagent-delegation");
    expect(subagentDelegationRule.category).toBe("practice");
    expect(subagentDelegationRule.weight).toBe(12);
  });

  it("大量出力を伴う探索が閾値未満（4 ターン）なら判定せず満点", () => {
    const r = subagentDelegationRule.evaluate(
      metricsFixture({ heavyExplorationTurns: 4, sidechainTurns: 0, assistantTurns: 20 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("委譲率 50%（満点閾値ちょうど）で満点", () => {
    // sidechainTurns 10 / assistantTurns 20 = 0.5
    const r = subagentDelegationRule.evaluate(
      metricsFixture({ heavyExplorationTurns: 8, sidechainTurns: 10, assistantTurns: 20 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("委譲率 80%（満点閾値の上）でも満点", () => {
    const r = subagentDelegationRule.evaluate(
      metricsFixture({ heavyExplorationTurns: 8, sidechainTurns: 16, assistantTurns: 20 }),
    );
    expect(r.score).toBe(1);
  });

  it("委譲が皆無（0 点閾値ちょうど）で 0 点", () => {
    const r = subagentDelegationRule.evaluate(
      metricsFixture({ heavyExplorationTurns: 8, sidechainTurns: 0, assistantTurns: 20 }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("委譲率 25%（中間）で 0.5 付近", () => {
    const r = subagentDelegationRule.evaluate(
      metricsFixture({ heavyExplorationTurns: 8, sidechainTurns: 5, assistantTurns: 20 }),
    );
    expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("assistantTurns が 0 でも落ちない（ゼロ除算を避ける）", () => {
    const r = subagentDelegationRule.evaluate(
      metricsFixture({ heavyExplorationTurns: 8, sidechainTurns: 0, assistantTurns: 0 }),
    );
    expect(r.score).toBe(1);
  });

  it("evidence に探索ターン数と sidechain ターン数を含める", () => {
    const r = subagentDelegationRule.evaluate(
      metricsFixture({ heavyExplorationTurns: 8, sidechainTurns: 5, assistantTurns: 20 }),
    );
    expect(r.evidence).toContain("8");
    expect(r.evidence).toContain("5");
  });
});
