import { describe, expect, it } from "vitest";
import { taskPlanningRule } from "./taskPlanning.js";
import { metricsFixture } from "./testHelpers.js";

describe("task-planning", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(taskPlanningRule.id).toBe("task-planning");
    expect(taskPlanningRule.category).toBe("practice");
    expect(taskPlanningRule.weight).toBe(4);
  });

  it("assistant ターンが minTurns 未満なら判定対象外で満点", () => {
    const r = taskPlanningRule.evaluate(
      metricsFixture({ assistantTurns: 10, toolCalls: 50 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("ツール呼び出しが minCalls 未満なら判定対象外で満点", () => {
    const r = taskPlanningRule.evaluate(
      metricsFixture({ assistantTurns: 30, toolCalls: 10 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("規模を満たし TodoWrite を1回でも使っていれば満点", () => {
    const r = taskPlanningRule.evaluate(
      metricsFixture({
        assistantTurns: 30,
        toolCalls: 50,
        toolsByName: { TodoWrite: { calls: 1, errors: 0 } },
      }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
    expect(r.evidence).toContain("1");
  });

  it("規模を満たし TodoWrite が無ければ 0 点で advice が非 null", () => {
    const r = taskPlanningRule.evaluate(
      metricsFixture({ assistantTurns: 30, toolCalls: 50, toolsByName: {} }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
    expect(r.evidence).toContain("50");
    expect(r.evidence).toContain("30");
  });
});
