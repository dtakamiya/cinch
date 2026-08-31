import { describe, expect, it } from "vitest";
import { RULE_CATEGORY, categoryOf } from "./ruleCategory.js";
import { WEIGHTS } from "../server/config/thresholds.js";
import { ALL_RULES } from "../server/rules/index.js";

describe("RULE_CATEGORY", () => {
  it("server の全ルール ID を過不足なく持つ", () => {
    const front = Object.keys(RULE_CATEGORY).sort();
    const server = Object.keys(WEIGHTS).sort();
    expect(front).toEqual(server);
  });

  it("各 ID のカテゴリが server 側ルール定義（rules/*.ts の category）と一致する", () => {
    for (const rule of ALL_RULES) {
      expect(RULE_CATEGORY[rule.id]).toBe(rule.category);
    }
  });

  it("categoryOf は未知 ID で null を返す", () => {
    expect(categoryOf("no-such-rule")).toBeNull();
    expect(categoryOf("cache-efficiency")).toBe("cost");
  });
});
