import { describe, expect, it } from "vitest";
import { oversizedToolResultsRule } from "./oversizedToolResults.js";
import { metricsFixture } from "./testHelpers.js";

describe("oversized-tool-results", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(oversizedToolResultsRule.id).toBe("oversized-tool-results");
    expect(oversizedToolResultsRule.category).toBe("productivity");
    expect(oversizedToolResultsRule.weight).toBe(4);
  });

  it("ツール呼び出しが minCalls 未満なら判定対象外で満点", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({ toolCalls: 5, oversizedResults: 3 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
    expect(r.evidence).toContain("判定対象外");
  });

  it("巨大な結果が 0 件なら満点", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({ toolCalls: 30, oversizedResults: 0 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("3 件なら部分点（0 < score < 1）で advice が非 null", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({
        toolCalls: 30,
        oversizedResults: 3,
        largestResultBytes: 20000,
        largestResultTool: "Read",
      }),
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
    expect(r.advice).not.toBeNull();
    expect(r.evidence).toContain("3");
    expect(r.evidence).toContain("Read");
  });

  it("6 件（zeroAtLeast）で 0 点", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({
        toolCalls: 30,
        oversizedResults: 6,
        largestResultBytes: 56000,
        largestResultTool: "Read",
      }),
    );
    expect(r.score).toBe(0);
  });

  it("largestResultTool が null のとき evidence にツール名の括弧書きを出さない", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({
        toolCalls: 30,
        oversizedResults: 3,
        largestResultBytes: 20000,
        largestResultTool: null,
      }),
    );
    // "（最大 20KB）" の形。ツール名や "null" の語を含まない
    expect(r.evidence).toContain("最大 20KB）");
    expect(r.evidence).not.toContain("null");
  });
});
