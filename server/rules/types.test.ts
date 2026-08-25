import { describe, expect, it } from "vitest";
import { pct, perfect, scaleDown, scaleUp } from "./types.js";

describe("scaleDown（小さいほど良い）", () => {
  it("perfectBelow 以下なら 1.0", () => {
    expect(scaleDown(0, 0.05, 0.25)).toBe(1);
    expect(scaleDown(0.05, 0.05, 0.25)).toBe(1);
  });

  it("zeroAbove 以上なら 0", () => {
    expect(scaleDown(0.25, 0.05, 0.25)).toBe(0);
    expect(scaleDown(0.9, 0.05, 0.25)).toBe(0);
  });

  it("中間は線形に補間する", () => {
    expect(scaleDown(0.15, 0.05, 0.25)).toBeCloseTo(0.5, 10);
    expect(scaleDown(0.1, 0.05, 0.25)).toBeCloseTo(0.75, 10);
  });

  it("perfectBelow === zeroAbove の退化ケースで NaN を返さない", () => {
    expect(scaleDown(0, 0, 0)).toBe(1);
    expect(scaleDown(1, 0, 0)).toBe(0);
  });
});

describe("scaleUp（大きいほど良い）", () => {
  it("perfectAbove 以上なら 1.0", () => {
    expect(scaleUp(0.9, 0.3, 0.9)).toBe(1);
    expect(scaleUp(1, 0.3, 0.9)).toBe(1);
  });

  it("zeroBelow 以下なら 0", () => {
    expect(scaleUp(0.3, 0.3, 0.9)).toBe(0);
    expect(scaleUp(0, 0.3, 0.9)).toBe(0);
  });

  it("中間は線形に補間する", () => {
    expect(scaleUp(0.6, 0.3, 0.9)).toBeCloseTo(0.5, 10);
  });

  it("zeroBelow === perfectAbove の退化ケースで NaN を返さない", () => {
    expect(scaleUp(1, 0.5, 0.5)).toBe(1);
    expect(scaleUp(0, 0.5, 0.5)).toBe(0);
  });
});

describe("perfect", () => {
  it("score 1.0 と advice null の RuleResult を作る", () => {
    expect(perfect("問題ありません")).toEqual({
      score: 1,
      evidence: "問題ありません",
      advice: null,
    });
  });
});

describe("pct", () => {
  it("比率を小数第 1 位のパーセント表記にする", () => {
    expect(pct(0.2551)).toBe("25.5%");
    expect(pct(0)).toBe("0.0%");
    expect(pct(1)).toBe("100.0%");
  });
});
