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

  it("week モードのメタ情報: bucketKind='week' / windowSize=null", () => {
    const out = buildCategoryTrends(
      [
        summary({ sessionId: "w1", startedAt: "2026-08-24T09:00:00.000Z" }),
        summary({ sessionId: "w2", startedAt: "2026-08-31T09:00:00.000Z" }),
      ],
      "cinch",
    );
    expect(out.bucketKind).toBe("week");
    expect(out.windowSize).toBeNull();
    expect(out.insufficient).toBe(false);
  });

  it("週バケット時は windowSize を無視する", () => {
    const list = [
      summary({ sessionId: "w1", startedAt: "2026-08-24T09:00:00.000Z" }),
      summary({ sessionId: "w2", startedAt: "2026-08-31T09:00:00.000Z" }),
    ];
    const withOpt = buildCategoryTrends(list, "cinch", {
      bucketKind: "week",
      windowSize: 3,
    });
    const noOpt = buildCategoryTrends(list, "cinch");
    expect(withOpt).toEqual(noOpt);
    expect(withOpt.windowSize).toBeNull();
  });
});

describe("buildCategoryTrends — session-window バケット", () => {
  /** 連日 1 件ずつ、開始時刻昇順の gradable セッション列を作る。 */
  function seq(
    count: number,
    catFor?: (i: number) => SessionSummary["categories"],
  ): SessionSummary[] {
    return Array.from({ length: count }, (_, i) =>
      summary({
        sessionId: `s${i}`,
        startedAt: new Date(Date.UTC(2026, 0, 1 + i, 12)).toISOString(),
        ...(catFor ? { categories: catFor(i) } : {}),
      }),
    );
  }

  it("件数が N 未満: current だけで previous が空 → insufficient", () => {
    const out = buildCategoryTrends(seq(3), "cinch", {
      bucketKind: "session-window",
      windowSize: 5,
    });
    expect(out.bucketKind).toBe("session-window");
    expect(out.windowSize).toBe(5);
    expect(out.insufficient).toBe(true);
    for (const s of out.series) {
      expect(s.points).toEqual([]);
      expect(s.delta).toBe(0);
    }
  });

  it("ちょうど N 件: previous が空 → insufficient", () => {
    const out = buildCategoryTrends(seq(3), "cinch", {
      bucketKind: "session-window",
      windowSize: 3,
    });
    expect(out.insufficient).toBe(true);
    expect(out.series[0]!.points).toEqual([]);
  });

  it("空 previous: sorted.length === N（N=5, 5 件） → insufficient", () => {
    const out = buildCategoryTrends(seq(5), "cinch", {
      bucketKind: "session-window",
      windowSize: 5,
    });
    expect(out.insufficient).toBe(true);
    for (const s of out.series) expect(s.points).toEqual([]);
  });

  it("N 超: 末尾 N 件を current・その手前 N 件を previous に分割して delta を出す", () => {
    // 前半 3 件 rate 0.5、後半 3 件 cost=0.8 / productivity=0.2 / practice=0.5、N=3
    const list = seq(6, (i) =>
      i < 3
        ? {
            cost: { earned: 5, max: 10 },
            productivity: { earned: 5, max: 10 },
            practice: { earned: 5, max: 10 },
          }
        : {
            cost: { earned: 8, max: 10 },
            productivity: { earned: 2, max: 10 },
            practice: { earned: 5, max: 10 },
          },
    );
    const out = buildCategoryTrends(list, "cinch", {
      bucketKind: "session-window",
      windowSize: 3,
    });
    expect(out.insufficient).toBe(false);
    expect(out.windowSize).toBe(3);
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points).toHaveLength(2);
    expect(cost.points[0]).toMatchObject({
      weekStart: "previous",
      earned: 15,
      max: 30,
      rate: 0.5,
      sessions: 3,
    });
    expect(cost.points[1]).toMatchObject({
      weekStart: "current",
      earned: 24,
      max: 30,
      rate: 0.8,
      sessions: 3,
    });
    expect(cost.delta).toBeCloseTo(0.3);
    expect(
      out.series.find((s) => s.category === "productivity")!.delta,
    ).toBeCloseTo(-0.3);
    expect(out.series.find((s) => s.category === "practice")!.delta).toBe(0);
  });

  it("N 超（N < 件数 < 2N）: previous は部分的でも非空なら分割する", () => {
    // 8 件・N=5 → current=末尾5・previous=先頭3
    const out = buildCategoryTrends(seq(8), "cinch", {
      bucketKind: "session-window",
      windowSize: 5,
    });
    expect(out.insufficient).toBe(false);
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points[0]!.sessions).toBe(3);
    expect(cost.points[1]!.sessions).toBe(5);
  });

  it("windowSize 省略時は 5 が既定", () => {
    const out = buildCategoryTrends(seq(10), "cinch", {
      bucketKind: "session-window",
    });
    expect(out.windowSize).toBe(5);
    expect(out.insufficient).toBe(false);
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points[0]!.sessions).toBe(5);
    expect(cost.points[1]!.sessions).toBe(5);
  });

  it("入力順に依存せず startedAt 昇順で窓を切る", () => {
    const list = seq(6, (i) =>
      i < 3
        ? {
            cost: { earned: 5, max: 10 },
            productivity: { earned: 5, max: 10 },
            practice: { earned: 5, max: 10 },
          }
        : {
            cost: { earned: 8, max: 10 },
            productivity: { earned: 8, max: 10 },
            practice: { earned: 8, max: 10 },
          },
    );
    const shuffled = [list[4]!, list[0]!, list[5]!, list[2]!, list[1]!, list[3]!];
    const out = buildCategoryTrends(shuffled, "cinch", {
      bucketKind: "session-window",
      windowSize: 3,
    });
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points[0]!.rate).toBe(0.5); // 先頭 3 件（古い方）
    expect(cost.points[1]!.rate).toBe(0.8); // 末尾 3 件（新しい方）
  });

  it("startedAt がパースできないセッションは窓の並びから除外する", () => {
    const list = [
      ...seq(6),
      summary({ sessionId: "bad", startedAt: "not-a-date" }),
    ];
    const out = buildCategoryTrends(list, "cinch", {
      bucketKind: "session-window",
      windowSize: 3,
    });
    expect(out.gradedCount).toBe(7);
    const cost = out.series.find((s) => s.category === "cost")!;
    expect(cost.points[0]!.sessions).toBe(3);
    expect(cost.points[1]!.sessions).toBe(3);
  });
});
