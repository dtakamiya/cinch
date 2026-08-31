import { describe, expect, it } from "vitest";
import {
  buildCategoryTrends,
  deltaDirection,
  weekStartUtc,
} from "./categoryTrend.js";
import type { SessionSummary } from "../shared/types.js";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "s1",
    projectName: "cinch",
    cwd: "/x/cinch",
    startedAt: "2026-08-25T10:00:00.000Z", // 月曜
    durationMs: 1000,
    assistantTurns: 10,
    total: 70,
    gradable: true,
    categories: {
      cost: { earned: 20, max: 35 },
      productivity: { earned: 25, max: 35 },
      practice: { earned: 15, max: 30 },
    },
    topDeduction: null,
    ...overrides,
  };
}

describe("weekStartUtc", () => {
  it("月曜はその日の 00:00 UTC を返す", () => {
    expect(weekStartUtc("2026-08-25T10:00:00.000Z")).toBe(
      "2026-08-24T00:00:00.000Z",
    );
  });

  it("日曜は同じ週（前の月曜）に丸める", () => {
    // 2026-08-30 は日曜 → 週頭は 2026-08-24（月）
    expect(weekStartUtc("2026-08-30T23:59:59.000Z")).toBe(
      "2026-08-24T00:00:00.000Z",
    );
  });

  it("翌月曜は次の週になる", () => {
    expect(weekStartUtc("2026-08-31T00:00:00.000Z")).toBe(
      "2026-08-31T00:00:00.000Z",
    );
  });

  it("パースできない時刻は null", () => {
    expect(weekStartUtc("not-a-date")).toBeNull();
  });
});

describe("deltaDirection", () => {
  it("正は up / 負は down / 0 は flat", () => {
    expect(deltaDirection(0.1)).toBe("up");
    expect(deltaDirection(-0.1)).toBe("down");
    expect(deltaDirection(0)).toBe("flat");
  });
});

describe("buildCategoryTrends", () => {
  it("空入力なら 3 系列・全て空 points・gradedCount 0", () => {
    const out = buildCategoryTrends([], "cinch");
    expect(out.projectName).toBe("cinch");
    expect(out.gradedCount).toBe(0);
    expect(out.series.map((s) => s.category)).toEqual([
      "cost",
      "productivity",
      "practice",
    ]);
    for (const s of out.series) {
      expect(s.points).toEqual([]);
      expect(s.delta).toBe(0);
    }
  });

  it("カテゴリ × 週で earned / max を合算し rate を出す", () => {
    const out = buildCategoryTrends(
      [
        summary({
          sessionId: "a",
          startedAt: "2026-08-24T09:00:00.000Z", // 第1週(月)
          categories: {
            cost: { earned: 10, max: 20 },
            productivity: { earned: 5, max: 10 },
            practice: { earned: 0, max: 10 },
          },
        }),
        summary({
          sessionId: "b",
          startedAt: "2026-08-26T09:00:00.000Z", // 同じ第1週(水)
          categories: {
            cost: { earned: 10, max: 20 },
            productivity: { earned: 5, max: 10 },
            practice: { earned: 10, max: 10 },
          },
        }),
      ],
      "cinch",
    );
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points).toHaveLength(1);
    expect(cost.points[0]).toMatchObject({
      weekStart: "2026-08-24T00:00:00.000Z",
      earned: 20,
      max: 40,
      rate: 0.5,
      sessions: 2,
    });
    const practice = out.series.find((s) => s.category === "practice")!;
    // 0+10 / 10+10 = 0.5
    expect(practice.points[0]!.rate).toBe(0.5);
  });

  it("週境界: 別々の週は別々の点になり昇順に並ぶ", () => {
    const out = buildCategoryTrends(
      [
        summary({ sessionId: "w2", startedAt: "2026-08-31T09:00:00.000Z" }), // 第2週
        summary({ sessionId: "w1", startedAt: "2026-08-24T09:00:00.000Z" }), // 第1週
      ],
      "cinch",
    );
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points.map((p) => p.weekStart)).toEqual([
      "2026-08-24T00:00:00.000Z",
      "2026-08-31T00:00:00.000Z",
    ]);
  });

  it("delta は最終週 rate − 直前週 rate（改善なら正）", () => {
    const out = buildCategoryTrends(
      [
        summary({
          sessionId: "w1",
          startedAt: "2026-08-24T09:00:00.000Z",
          categories: {
            cost: { earned: 5, max: 10 }, // 0.5
            productivity: { earned: 5, max: 10 },
            practice: { earned: 5, max: 10 },
          },
        }),
        summary({
          sessionId: "w2",
          startedAt: "2026-08-31T09:00:00.000Z",
          categories: {
            cost: { earned: 8, max: 10 }, // 0.8
            productivity: { earned: 2, max: 10 }, // 0.2
            practice: { earned: 5, max: 10 }, // 0.5
          },
        }),
      ],
      "cinch",
    );
    expect(out.series.find((s) => s.category === "cost")!.delta).toBeCloseTo(0.3);
    expect(
      out.series.find((s) => s.category === "productivity")!.delta,
    ).toBeCloseTo(-0.3);
    expect(out.series.find((s) => s.category === "practice")!.delta).toBe(0);
  });

  it("データ不足: 週が 1 つだけなら delta は 0", () => {
    const out = buildCategoryTrends(
      [summary({ sessionId: "a", startedAt: "2026-08-24T09:00:00.000Z" })],
      "cinch",
    );
    for (const s of out.series) {
      expect(s.points).toHaveLength(1);
      expect(s.delta).toBe(0);
    }
  });

  it("max 合計が 0 の週は rate 0（0 除算しない）", () => {
    const out = buildCategoryTrends(
      [
        summary({
          sessionId: "a",
          startedAt: "2026-08-24T09:00:00.000Z",
          categories: {
            cost: { earned: 0, max: 0 },
            productivity: { earned: 0, max: 0 },
            practice: { earned: 0, max: 0 },
          },
        }),
        summary({
          sessionId: "b",
          startedAt: "2026-08-25T09:00:00.000Z",
          categories: {
            cost: { earned: 0, max: 0 },
            productivity: { earned: 0, max: 0 },
            practice: { earned: 0, max: 0 },
          },
        }),
      ],
      "cinch",
    );
    for (const s of out.series) {
      expect(s.points[0]!.rate).toBe(0);
    }
    // gradable:true だが max 0 なので gradedCount には含まれる（除外は gradable:false のみ）
    expect(out.gradedCount).toBe(2);
  });

  it("gradable:false のセッションは集計から除外する", () => {
    const out = buildCategoryTrends(
      [
        summary({ sessionId: "ok", startedAt: "2026-08-24T09:00:00.000Z" }),
        summary({
          sessionId: "ng",
          startedAt: "2026-08-31T09:00:00.000Z",
          gradable: false,
          total: 0,
          categories: {
            cost: { earned: 0, max: 0 },
            productivity: { earned: 0, max: 0 },
            practice: { earned: 0, max: 0 },
          },
        }),
      ],
      "cinch",
    );
    expect(out.gradedCount).toBe(1);
    // 第2週(ng)は除外されるので週は 1 つだけ
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points).toHaveLength(1);
    expect(cost.points[0]!.weekStart).toBe("2026-08-24T00:00:00.000Z");
  });

  it("別プロジェクトのセッションは無視する", () => {
    const out = buildCategoryTrends(
      [
        summary({ sessionId: "a", projectName: "cinch" }),
        summary({ sessionId: "b", projectName: "other" }),
      ],
      "cinch",
    );
    expect(out.gradedCount).toBe(1);
  });

  it("startedAt がパースできないセッションは週に割り当てられず除外する", () => {
    const out = buildCategoryTrends(
      [
        summary({ sessionId: "ok", startedAt: "2026-08-24T09:00:00.000Z" }),
        summary({ sessionId: "bad", startedAt: "not-a-date" }),
      ],
      "cinch",
    );
    // graded フィルタ自体は通るが週に入らない
    expect(out.gradedCount).toBe(2);
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points).toHaveLength(1);
    expect(cost.points[0]!.sessions).toBe(1);
  });
});
