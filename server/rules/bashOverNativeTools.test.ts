import { describe, expect, it } from "vitest";
import { bashOverNativeToolsRule } from "./bashOverNativeTools.js";
import { metricsFixture } from "./testHelpers.js";

describe("bash-over-native-tools", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(bashOverNativeToolsRule.id).toBe("bash-over-native-tools");
    expect(bashOverNativeToolsRule.category).toBe("productivity");
    expect(bashOverNativeToolsRule.weight).toBe(3);
  });

  it("ツール呼び出しが minCalls 未満なら判定対象外で満点", () => {
    const r = bashOverNativeToolsRule.evaluate(
      metricsFixture({ toolCalls: 9, bashInsteadOfTool: 5 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
    expect(r.evidence).toContain("判定対象外");
  });

  it("代替可能な Bash が 0 回なら満点", () => {
    const r = bashOverNativeToolsRule.evaluate(
      metricsFixture({ toolCalls: 50, bashInsteadOfTool: 0 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("割合が高いと 0 点になる", () => {
    const r = bashOverNativeToolsRule.evaluate(
      metricsFixture({
        toolCalls: 100,
        bashInsteadOfTool: 40,
        bashInsteadOfToolByCommand: { cat: 20, grep: 15, ls: 5 },
      }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("部分点のとき evidence に割合と内訳を出す", () => {
    const r = bashOverNativeToolsRule.evaluate(
      metricsFixture({
        toolCalls: 100,
        bashInsteadOfTool: 15,
        bashInsteadOfToolByCommand: { cat: 8, ls: 5, grep: 2 },
      }),
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
    expect(r.evidence).toContain("15.0%");
    expect(r.evidence).toContain("cat 8 回");
  });

  it("内訳は多い順に上位 3 件までに絞る", () => {
    const r = bashOverNativeToolsRule.evaluate(
      metricsFixture({
        toolCalls: 100,
        bashInsteadOfTool: 15,
        bashInsteadOfToolByCommand: { cat: 6, ls: 4, grep: 3, find: 1, sed: 1 },
      }),
    );
    expect(r.evidence).toContain("cat 6 回");
    expect(r.evidence).toContain("grep 3 回");
    // 4 件目以降は出さない
    expect(r.evidence).not.toContain("sed");
  });
});
