import { describe, expect, it } from "vitest";
import { ALL_RULES } from "./index.js";
import { WEIGHTS } from "../config/thresholds.js";
import { metricsFixture } from "./testHelpers.js";

describe("ALL_RULES", () => {
  it("15 件のルールを登録している", () => {
    expect(ALL_RULES).toHaveLength(15);
  });

  it("ID が重複しない", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("WEIGHTS のすべての ID をカバーしている", () => {
    expect(ALL_RULES.map((r) => r.id).sort()).toEqual(Object.keys(WEIGHTS).sort());
  });

  it("各ルールの weight が WEIGHTS と一致する", () => {
    for (const rule of ALL_RULES) {
      expect(rule.weight).toBe(WEIGHTS[rule.id]);
    }
  });

  it("配点の合計が 100 である", () => {
    expect(ALL_RULES.reduce((sum, r) => sum + r.weight, 0)).toBe(100);
  });

  it("すべてのルールが label を持つ", () => {
    for (const rule of ALL_RULES) {
      expect(rule.label.length).toBeGreaterThan(0);
    }
  });

  it("どのルールも 0〜1 の score を返す", () => {
    const m = metricsFixture({
      toolCalls: 100,
      toolErrors: 30,
      redundantReads: 8,
      parallelizableOpportunities: 10,
      parallelizableSequences: 9,
      heavyExplorationTurns: 8,
      sidechainTurns: 0,
      contextGrowth: [1000, 50_000, 100_000, 150_000, 200_000, 250_000],
      cache1hCreations: 5,
      cacheExpirations: 5,
      simpleWorkTurns: 10,
      simpleWorkOnExpensiveModel: 10,
      hasClaudeMd: false,
      totals: { input: 5000, output: 100, cacheCreate: 5000, cacheRead: 100 },
    });
    for (const rule of ALL_RULES) {
      const result = rule.evaluate(m);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.evidence.length).toBeGreaterThan(0);
    }
  });

  it("満点のとき advice は null、減点のとき advice は非 null", () => {
    const m = metricsFixture();
    for (const rule of ALL_RULES) {
      const result = rule.evaluate(m);
      if (result.score === 1) expect(result.advice).toBeNull();
      else expect(result.advice).not.toBeNull();
    }
  });
});
