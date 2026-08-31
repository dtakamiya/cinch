import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boxStats,
  buildBenchmark,
  median,
  MIN_GRADED_FOR_STATS,
  quantileSorted,
  sortBenchmarkRows,
  type BenchmarkRow,
} from "./benchmark.js";
import type { SessionSummary } from "../shared/types.js";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "s1",
    projectName: "cinch",
    cwd: "/x/cinch",
    startedAt: "2026-08-25T10:00:00.000Z",
    durationMs: 1000,
    assistantTurns: 10,
    total: 70,
    gradable: true,
    categories: {
      cost: { earned: 20, max: 40 },
      productivity: { earned: 25, max: 35 },
      practice: { earned: 15, max: 30 },
    },
    topDeduction: { id: "tool-error-rate", lost: 9 },
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("quantileSorted", () => {
  it("空配列は 0", () => {
    expect(quantileSorted([], 0.5)).toBe(0);
  });

  it("1 要素はその値", () => {
    expect(quantileSorted([42], 0.25)).toBe(42);
  });

  it("線形補間で分位を返す", () => {
    // [10,20,30,40] の 0.5 は pos=1.5 → 20 + 0.5*(30-20) = 25
    expect(quantileSorted([10, 20, 30, 40], 0.5)).toBe(25);
    // 0.25 は pos=0.75 → 10 + 0.75*10 = 17.5
    expect(quantileSorted([10, 20, 30, 40], 0.25)).toBe(17.5);
    // 0.75 は pos=2.25 → 30 + 0.25*10 = 32.5
    expect(quantileSorted([10, 20, 30, 40], 0.75)).toBe(32.5);
  });

  it("p は 0..1 にクランプされる", () => {
    expect(quantileSorted([1, 2, 3], -1)).toBe(1);
    expect(quantileSorted([1, 2, 3], 5)).toBe(3);
  });
});

describe("median", () => {
  it("奇数個は中央、偶数個は中央 2 つの平均", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("boxStats", () => {
  it("空配列は null", () => {
    expect(boxStats([])).toBeNull();
  });

  it("5 数要約を返す", () => {
    const b = boxStats([10, 20, 30, 40, 50])!;
    expect(b.min).toBe(10);
    expect(b.max).toBe(50);
    expect(b.median).toBe(30);
    expect(b.q1).toBe(20);
    expect(b.q3).toBe(40);
  });
});

describe("sortBenchmarkRows", () => {
  const mk = (name: string, medianScore: number | null, gradedCount: number): BenchmarkRow => ({
    projectName: name,
    gradedCount,
    medianScore,
    box: null,
    categoryMedian: { cost: null, productivity: null, practice: null },
    topDeduction: null,
    declines: [],
  });

  it("median 昇順（下手な順）が既定、null は末尾", () => {
    const out = sortBenchmarkRows(
      [mk("a", 80, 5), mk("b", 40, 5), mk("c", null, 2)],
      "median",
      "asc",
    );
    expect(out.map((r) => r.projectName)).toEqual(["b", "a", "c"]);
  });

  it("desc でも null は末尾のまま", () => {
    const out = sortBenchmarkRows(
      [mk("a", 80, 5), mk("b", 40, 5), mk("c", null, 2)],
      "median",
      "desc",
    );
    expect(out.map((r) => r.projectName)).toEqual(["a", "b", "c"]);
  });

  it("count でソートできる", () => {
    const out = sortBenchmarkRows(
      [mk("a", 80, 5), mk("b", 40, 9), mk("c", 60, 1)],
      "count",
      "asc",
    );
    expect(out.map((r) => r.projectName)).toEqual(["c", "a", "b"]);
  });

  it("同値はプロジェクト名で安定ソート", () => {
    const out = sortBenchmarkRows([mk("z", 50, 5), mk("a", 50, 5)], "median", "asc");
    expect(out.map((r) => r.projectName)).toEqual(["a", "z"]);
  });
});

describe("buildBenchmark", () => {
  it("空入力なら rows 空・projectCount 0", () => {
    const out = buildBenchmark([], { period: "all" });
    expect(out.rows).toEqual([]);
    expect(out.projectCount).toBe(0);
  });

  it("採点済み 1 件以上のプロジェクトが 1 行ずつ並ぶ（既定は median 昇順）", () => {
    const out = buildBenchmark(
      [
        summary({ sessionId: "a1", projectName: "alpha", total: 90 }),
        summary({ sessionId: "a2", projectName: "alpha", total: 80 }),
        summary({ sessionId: "a3", projectName: "alpha", total: 85 }),
        summary({ sessionId: "b1", projectName: "beta", total: 40 }),
        summary({ sessionId: "b2", projectName: "beta", total: 50 }),
        summary({ sessionId: "b3", projectName: "beta", total: 45 }),
      ],
      { period: "all" },
    );
    expect(out.rows.map((r) => r.projectName)).toEqual(["beta", "alpha"]);
    expect(out.rows[0]!.medianScore).toBe(45);
    expect(out.rows[1]!.medianScore).toBe(85);
    expect(out.projectCount).toBe(2);
  });

  it("母数 N 件未満は medianScore / box / categoryMedian を出さず件数のみ（AC6）", () => {
    expect(MIN_GRADED_FOR_STATS).toBe(3);
    const out = buildBenchmark(
      [
        summary({ sessionId: "a", projectName: "tiny", total: 30 }),
        summary({ sessionId: "b", projectName: "tiny", total: 90 }),
      ],
      { period: "all" },
    );
    const row = out.rows[0]!;
    expect(row.projectName).toBe("tiny");
    expect(row.gradedCount).toBe(2);
    expect(row.medianScore).toBeNull();
    expect(row.box).toBeNull();
    expect(row.categoryMedian).toEqual({
      cost: null,
      productivity: null,
      practice: null,
    });
  });

  it("N 件ちょうどで統計が出る（境界）", () => {
    const out = buildBenchmark(
      [
        summary({ sessionId: "a", projectName: "p", total: 10 }),
        summary({ sessionId: "b", projectName: "p", total: 20 }),
        summary({ sessionId: "c", projectName: "p", total: 30 }),
      ],
      { period: "all" },
    );
    const row = out.rows[0]!;
    expect(row.medianScore).toBe(20);
    expect(row.box).not.toBeNull();
    expect(row.box!.min).toBe(10);
    expect(row.box!.max).toBe(30);
  });

  it("gradable:false は中央値・箱ひげから除外し、採点済み件数にのみ含める（AC5）", () => {
    const out = buildBenchmark(
      [
        summary({ sessionId: "a", projectName: "p", total: 60 }),
        summary({ sessionId: "b", projectName: "p", total: 60 }),
        summary({ sessionId: "c", projectName: "p", total: 60 }),
        summary({
          sessionId: "x",
          projectName: "p",
          gradable: false,
          total: 0,
          categories: {
            cost: { earned: 0, max: 0 },
            productivity: { earned: 0, max: 0 },
            practice: { earned: 0, max: 0 },
          },
          topDeduction: null,
        }),
      ],
      { period: "all" },
    );
    const row = out.rows[0]!;
    // gradable の 3 件だけで中央値。gradable:false の total:0 が混ざれば 0 に引っ張られるはず
    expect(row.medianScore).toBe(60);
    expect(row.box!.min).toBe(60);
    // gradedCount は gradable のみ（AC5: 採点済み件数にのみ含める → gradable が採点済み）
    expect(row.gradedCount).toBe(3);
  });

  it("gradable:false だけのプロジェクトは行に出ない", () => {
    const out = buildBenchmark(
      [
        summary({
          sessionId: "x",
          projectName: "empty",
          gradable: false,
          total: 0,
          topDeduction: null,
        }),
      ],
      { period: "all" },
    );
    expect(out.rows).toEqual([]);
  });

  it("期間フィルタで再集計し、期間内に採点済みが無いプロジェクトは消える（AC4）", () => {
    vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
    const out = buildBenchmark(
      [
        // recent: 直近 7 日に 3 件
        summary({ sessionId: "r1", projectName: "recent", startedAt: "2026-08-24T00:00:00.000Z" }),
        summary({ sessionId: "r2", projectName: "recent", startedAt: "2026-08-23T00:00:00.000Z" }),
        summary({ sessionId: "r3", projectName: "recent", startedAt: "2026-08-22T00:00:00.000Z" }),
        // stale: 30 日以上前
        summary({ sessionId: "s1", projectName: "stale", startedAt: "2026-06-01T00:00:00.000Z" }),
      ],
      { period: "7d" },
    );
    expect(out.rows.map((r) => r.projectName)).toEqual(["recent"]);
  });

  it("topDeduction を id で最頻集計する。null は数えない（AC2）", () => {
    const out = buildBenchmark(
      [
        summary({ sessionId: "a", projectName: "p", topDeduction: { id: "tool-error-rate", lost: 5 } }),
        summary({ sessionId: "b", projectName: "p", topDeduction: { id: "tool-error-rate", lost: 3 } }),
        summary({ sessionId: "c", projectName: "p", topDeduction: { id: "model-fit", lost: 8 } }),
        summary({ sessionId: "d", projectName: "p", topDeduction: null }),
      ],
      { period: "all" },
    );
    expect(out.rows[0]!.topDeduction).toEqual({ id: "tool-error-rate", count: 2 });
  });

  it("topDeduction が全 null なら null（AC2）", () => {
    const out = buildBenchmark(
      [
        summary({ sessionId: "a", projectName: "p", total: 100, topDeduction: null }),
        summary({ sessionId: "b", projectName: "p", total: 100, topDeduction: null }),
        summary({ sessionId: "c", projectName: "p", total: 100, topDeduction: null }),
      ],
      { period: "all" },
    );
    expect(out.rows[0]!.topDeduction).toBeNull();
  });

  it("topDeduction 最頻が同数のときは id 昇順で決定的に選ぶ", () => {
    const out = buildBenchmark(
      [
        summary({ sessionId: "a", projectName: "p", topDeduction: { id: "zzz", lost: 1 } }),
        summary({ sessionId: "b", projectName: "p", topDeduction: { id: "aaa", lost: 1 } }),
        summary({ sessionId: "c", projectName: "p", topDeduction: { id: "aaa", lost: 1 } }),
        summary({ sessionId: "d", projectName: "p", topDeduction: { id: "zzz", lost: 1 } }),
      ],
      { period: "all" },
    );
    // aaa:2, zzz:2 → id 昇順で aaa
    expect(out.rows[0]!.topDeduction).toEqual({ id: "aaa", count: 2 });
  });

  it("カテゴリ中央値はセッション単位の獲得率の中央値（max 0 は 0 として扱う）", () => {
    const out = buildBenchmark(
      [
        summary({
          sessionId: "a",
          projectName: "p",
          categories: {
            cost: { earned: 10, max: 20 }, // 0.5
            productivity: { earned: 0, max: 10 }, // 0
            practice: { earned: 0, max: 0 }, // 0
          },
        }),
        summary({
          sessionId: "b",
          projectName: "p",
          categories: {
            cost: { earned: 20, max: 20 }, // 1.0
            productivity: { earned: 5, max: 10 }, // 0.5
            practice: { earned: 0, max: 0 }, // 0
          },
        }),
        summary({
          sessionId: "c",
          projectName: "p",
          categories: {
            cost: { earned: 0, max: 20 }, // 0
            productivity: { earned: 10, max: 10 }, // 1.0
            practice: { earned: 0, max: 0 }, // 0
          },
        }),
      ],
      { period: "all" },
    );
    const cm = out.rows[0]!.categoryMedian;
    // cost: [0, 0.5, 1.0] → 0.5
    expect(cm.cost).toBe(0.5);
    // productivity: [0, 0.5, 1.0] → 0.5
    expect(cm.productivity).toBe(0.5);
    // practice: [0,0,0] → 0
    expect(cm.practice).toBe(0);
  });

  it("前後半デルタが閾値超で悪化しているカテゴリを declines に出す（AC7）", () => {
    // 前半 2 件は cost 高, 後半 2 件は cost 低 → cost が悪化
    const out = buildBenchmark(
      [
        summary({
          sessionId: "t1",
          projectName: "p",
          startedAt: "2026-08-20T00:00:00.000Z",
          categories: {
            cost: { earned: 18, max: 20 }, // 0.9
            productivity: { earned: 5, max: 10 },
            practice: { earned: 5, max: 10 },
          },
        }),
        summary({
          sessionId: "t2",
          projectName: "p",
          startedAt: "2026-08-21T00:00:00.000Z",
          categories: {
            cost: { earned: 18, max: 20 }, // 0.9
            productivity: { earned: 5, max: 10 },
            practice: { earned: 5, max: 10 },
          },
        }),
        summary({
          sessionId: "t3",
          projectName: "p",
          startedAt: "2026-08-22T00:00:00.000Z",
          categories: {
            cost: { earned: 4, max: 20 }, // 0.2
            productivity: { earned: 5, max: 10 },
            practice: { earned: 5, max: 10 },
          },
        }),
        summary({
          sessionId: "t4",
          projectName: "p",
          startedAt: "2026-08-23T00:00:00.000Z",
          categories: {
            cost: { earned: 4, max: 20 }, // 0.2
            productivity: { earned: 5, max: 10 },
            practice: { earned: 5, max: 10 },
          },
        }),
      ],
      { period: "all" },
    );
    const declines = out.rows[0]!.declines;
    expect(declines.map((d) => d.category)).toEqual(["cost"]);
    expect(declines[0]!.firstHalf).toBeCloseTo(0.9);
    expect(declines[0]!.secondHalf).toBeCloseTo(0.2);
    expect(declines[0]!.delta).toBeLessThan(0);
  });

  it("悪化が無ければ declines は空", () => {
    const out = buildBenchmark(
      [
        summary({ sessionId: "a", projectName: "p", startedAt: "2026-08-20T00:00:00.000Z" }),
        summary({ sessionId: "b", projectName: "p", startedAt: "2026-08-21T00:00:00.000Z" }),
        summary({ sessionId: "c", projectName: "p", startedAt: "2026-08-22T00:00:00.000Z" }),
      ],
      { period: "all" },
    );
    expect(out.rows[0]!.declines).toEqual([]);
  });
});
