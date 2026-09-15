import { describe, expect, it } from "vitest";
import { buildRuleTrends, isoWeek, isoWeekKey, type RuleTrendSessionInput } from "./aggregate.js";

describe("isoWeek / isoWeekKey", () => {
  it("パースできない時刻は null", () => {
    expect(isoWeek("not-a-date")).toBeNull();
    expect(isoWeekKey("not-a-date")).toBeNull();
  });

  it("年始が月曜のケース（2024-01-01 は月曜）", () => {
    expect(isoWeekKey("2024-01-01T00:00:00.000Z")).toBe("2024-W01");
  });

  it("年跨ぎ: 前年末の日付が翌年の第1週に属する（2024-12-31 は火曜）", () => {
    // 2024-12-31（火）の木曜日は 2025-01-02 → 2025-W01
    expect(isoWeekKey("2024-12-31T00:00:00.000Z")).toBe("2025-W01");
  });

  it("年跨ぎ: 年始の日付が前年の最終週に属する（2023-01-01 は日曜）", () => {
    // 2023-01-01（日）の木曜日は 2022-12-29 → 2022-W52
    expect(isoWeekKey("2023-01-01T00:00:00.000Z")).toBe("2022-W52");
  });

  it("うるう年: 2020年は ISO週53まである（2020-12-31 は木曜）", () => {
    expect(isoWeekKey("2020-12-31T00:00:00.000Z")).toBe("2020-W53");
  });

  it("うるう年: 2020-01-01（水）は 2020-W01", () => {
    expect(isoWeekKey("2020-01-01T00:00:00.000Z")).toBe("2020-W01");
  });

  it("週境界: 月曜0時と日曜23:59は別の週", () => {
    const monday = isoWeek("2026-03-02T00:00:00.000Z"); // 月曜
    const sunday = isoWeek("2026-03-08T23:59:59.000Z"); // 日曜（同じ週の終わり）
    expect(monday).toEqual({ year: 2026, week: 10 });
    expect(sunday).toEqual({ year: 2026, week: 10 });
    const nextMonday = isoWeek("2026-03-09T00:00:00.000Z");
    expect(nextMonday).toEqual({ year: 2026, week: 11 });
  });
});

function rule(
  id: string,
  earned: number,
  max = 10,
  category: "cost" | "productivity" | "practice" = "cost",
): { id: string; category: "cost" | "productivity" | "practice"; earned: number; max: number } {
  return { id, category, earned, max };
}

function session(
  overrides: Partial<RuleTrendSessionInput> & { startedAt: string },
): RuleTrendSessionInput {
  return {
    sessionId: overrides.sessionId ?? `s-${overrides.startedAt}`,
    projectName: overrides.projectName ?? "proj",
    gradable: overrides.gradable ?? true,
    rules: overrides.rules ?? [rule("cache-efficiency", 8), rule("tool-error-rate", 5)],
    ...overrides,
  };
}

describe("buildRuleTrends", () => {
  it("採点済みセッションが無いプロジェクトは hasEnoughData:false", () => {
    const res = buildRuleTrends([], "proj");
    expect(res.hasEnoughData).toBe(false);
    expect(res.rules).toEqual([]);
    expect(typeof res.message).toBe("string");
  });

  it("projectName で絞り込む", () => {
    const sessions = [
      session({ startedAt: "2026-01-05T00:00:00.000Z", projectName: "a" }),
      session({ startedAt: "2026-01-12T00:00:00.000Z", projectName: "b" }),
    ];
    const res = buildRuleTrends(sessions, "a");
    expect(res.hasEnoughData).toBe(false); // a には週が1つしかない
  });

  it("gradable:false は除外する", () => {
    const sessions = [
      session({ startedAt: "2026-01-05T00:00:00.000Z", gradable: false }),
      session({ startedAt: "2026-01-12T00:00:00.000Z", gradable: false }),
    ];
    const res = buildRuleTrends(sessions, "proj");
    expect(res.hasEnoughData).toBe(false);
  });

  it("週が1つしか無ければ hasEnoughData:false", () => {
    const sessions = [
      session({ startedAt: "2026-01-05T00:00:00.000Z" }),
      session({ startedAt: "2026-01-06T00:00:00.000Z" }),
    ];
    const res = buildRuleTrends(sessions, "proj");
    expect(res.hasEnoughData).toBe(false);
    expect(res.rules).toEqual([]);
  });

  it("週次: 2週分あれば delta を計算し、delta昇順（null末尾）でソートする", () => {
    const sessions = [
      // week1 (2026-01-05 は月曜, 2026-W02)
      session({
        startedAt: "2026-01-05T00:00:00.000Z",
        rules: [rule("cache-efficiency", 10, 10), rule("tool-error-rate", 10, 10)],
      }),
      // week2 (2026-01-12, 2026-W03)
      session({
        startedAt: "2026-01-12T00:00:00.000Z",
        rules: [rule("cache-efficiency", 0, 10), rule("tool-error-rate", 10, 10)],
      }),
    ];
    const res = buildRuleTrends(sessions, "proj", { bucketKind: "week" });
    expect(res.hasEnoughData).toBe(true);
    expect(res.bucketKind).toBe("week");
    expect(res.windowSize).toBeNull();

    const ids = res.rules.map((r) => r.id);
    // cache-efficiency は 1.0 -> 0.0（悪化）、tool-error-rate は 1.0 -> 1.0（横ばい）
    expect(ids[0]).toBe("cache-efficiency");
    const cache = res.rules.find((r) => r.id === "cache-efficiency")!;
    expect(cache.delta).toBe(-1);
    expect(cache.points).toHaveLength(2);
    expect(cache.points[0]!.bucketKey).toBe("2026-W02");
    expect(cache.points[1]!.bucketKey).toBe("2026-W03");

    const toolError = res.rules.find((r) => r.id === "tool-error-rate")!;
    expect(toolError.delta).toBe(0);
  });

  it("session-window: current/previewのどちらかが空なら hasEnoughData:false", () => {
    const sessions = [
      session({ startedAt: "2026-01-05T00:00:00.000Z" }),
      session({ startedAt: "2026-01-06T00:00:00.000Z" }),
      session({ startedAt: "2026-01-07T00:00:00.000Z" }),
    ];
    const res = buildRuleTrends(sessions, "proj", {
      bucketKind: "session-window",
      windowSize: 5,
    });
    expect(res.hasEnoughData).toBe(false);
    expect(res.bucketKind).toBe("session-window");
    expect(res.windowSize).toBe(5);
  });

  it("session-window: previous/current 十分なら 2 点の推移を作る", () => {
    const previous = ["2026-01-01", "2026-01-02", "2026-01-03"].map((d) =>
      session({
        startedAt: `${d}T00:00:00.000Z`,
        rules: [rule("cache-efficiency", 0, 10)],
      }),
    );
    const current = ["2026-01-04", "2026-01-05", "2026-01-06"].map((d) =>
      session({
        startedAt: `${d}T00:00:00.000Z`,
        rules: [rule("cache-efficiency", 10, 10)],
      }),
    );
    const res = buildRuleTrends([...previous, ...current], "proj", {
      bucketKind: "session-window",
      windowSize: 3,
    });
    expect(res.hasEnoughData).toBe(true);
    const cache = res.rules.find((r) => r.id === "cache-efficiency")!;
    expect(cache.points.map((p) => p.bucketKey)).toEqual(["previous", "current"]);
    expect(cache.points[0]!.rate).toBe(0);
    expect(cache.points[1]!.rate).toBe(1);
    expect(cache.delta).toBe(1);
  });

  it("max が 0 のルールは rate:null になり delta も null", () => {
    const sessions = [
      session({
        startedAt: "2026-01-05T00:00:00.000Z",
        rules: [rule("unused-rule", 0, 0)],
      }),
      session({
        startedAt: "2026-01-12T00:00:00.000Z",
        rules: [rule("unused-rule", 0, 0)],
      }),
    ];
    const res = buildRuleTrends(sessions, "proj");
    const r = res.rules.find((x) => x.id === "unused-rule")!;
    expect(r.points.every((p) => p.rate === null)).toBe(true);
    expect(r.delta).toBeNull();
  });
});
