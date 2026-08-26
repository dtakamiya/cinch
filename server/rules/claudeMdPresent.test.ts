import { describe, expect, it } from "vitest";
import { claudeMdPresentRule } from "./claudeMdPresent.js";
import { metricsFixture } from "./testHelpers.js";

describe("claude-md-present", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(claudeMdPresentRule.id).toBe("claude-md-present");
    expect(claudeMdPresentRule.category).toBe("practice");
    expect(claudeMdPresentRule.weight).toBe(6);
  });

  it("CLAUDE.md があれば満点", () => {
    const r = claudeMdPresentRule.evaluate(metricsFixture({ hasClaudeMd: true }));
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("CLAUDE.md が無ければ 0 点で advice を返す", () => {
    const r = claudeMdPresentRule.evaluate(metricsFixture({ hasClaudeMd: false }));
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
  });

  it("evidence に cwd を含める", () => {
    const r = claudeMdPresentRule.evaluate(
      metricsFixture({ hasClaudeMd: false, cwd: "/Users/x/work/foo" }),
    );
    expect(r.evidence).toContain("/Users/x/work/foo");
  });
});
