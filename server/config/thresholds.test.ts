import { describe, expect, it } from "vitest";
import { THRESHOLDS, WEIGHTS } from "./thresholds.js";

describe("WEIGHTS", () => {
  it("配点の合計が 100 である", () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("12 ルール分の配点を持つ", () => {
    expect(Object.keys(WEIGHTS)).toHaveLength(12);
  });

  it("カテゴリごとの小計が 35 / 35 / 30 である", () => {
    const cost =
      WEIGHTS["cache-efficiency"] +
      WEIGHTS["cache-ttl-waste"] +
      WEIGHTS["model-fit"];
    const productivity =
      WEIGHTS["tool-error-rate"] +
      WEIGHTS["redundant-file-reads"] +
      WEIGHTS["parallel-tool-use"] +
      WEIGHTS["turn-efficiency"] +
      WEIGHTS["oversized-tool-results"];
    const practice =
      WEIGHTS["subagent-delegation"] +
      WEIGHTS["context-growth"] +
      WEIGHTS["claude-md-present"] +
      WEIGHTS["task-planning"];
    expect([cost, productivity, practice]).toEqual([35, 35, 30]);
  });
});

describe("THRESHOLDS", () => {
  it("採点対象の最小 assistant ターン数は 3", () => {
    expect(THRESHOLDS.minGradableTurns).toBe(3);
  });

  it("各閾値は下限 < 上限の関係を満たす", () => {
    expect(THRESHOLDS.toolErrorRate.perfectBelow).toBeLessThan(
      THRESHOLDS.toolErrorRate.zeroAbove,
    );
    expect(THRESHOLDS.cacheEfficiency.zeroBelow).toBeLessThan(
      THRESHOLDS.cacheEfficiency.perfectAbove,
    );
    expect(THRESHOLDS.contextGrowth.perfectBelow).toBeLessThan(
      THRESHOLDS.contextGrowth.zeroAbove,
    );
  });
});
