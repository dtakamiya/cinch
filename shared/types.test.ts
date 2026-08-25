import { describe, expect, it } from "vitest";
import { emptyUsage, CATEGORIES } from "./types.js";

describe("emptyUsage", () => {
  it("全フィールドが 0 の Usage を返す", () => {
    expect(emptyUsage()).toEqual({
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheCreate1h: 0,
      cacheCreate5m: 0,
      cacheRead: 0,
    });
  });

  it("呼び出しごとに別のオブジェクトを返す（共有されない）", () => {
    const a = emptyUsage();
    a.input = 100;
    expect(emptyUsage().input).toBe(0);
  });
});

describe("CATEGORIES", () => {
  it("3 カテゴリを定義している", () => {
    expect(CATEGORIES).toEqual(["cost", "productivity", "practice"]);
  });
});
