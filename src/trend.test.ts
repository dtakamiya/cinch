import { describe, expect, it } from "vitest";
import { buildTrend } from "./trend.js";
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
      cost: { earned: 25, max: 35 },
      productivity: { earned: 25, max: 35 },
      practice: { earned: 20, max: 30 },
    },
    topDeduction: null,
    ...overrides,
  };
}

describe("buildTrend", () => {
  it("開始時刻の昇順に点を並べる", () => {
    const out = buildTrend([
      summary({ sessionId: "c", startedAt: "2026-08-27T00:00:00.000Z", total: 80 }),
      summary({ sessionId: "a", startedAt: "2026-08-25T00:00:00.000Z", total: 60 }),
      summary({ sessionId: "b", startedAt: "2026-08-26T00:00:00.000Z", total: 70 }),
    ]);
    expect(out.points.map((p) => p.sessionId)).toEqual(["a", "b", "c"]);
  });

  it("採点対象外を除外する", () => {
    const out = buildTrend([
      summary({ sessionId: "a", total: 60 }),
      summary({ sessionId: "b", gradable: false, total: 0 }),
    ]);
    expect(out.points.map((p) => p.sessionId)).toEqual(["a"]);
  });

  it("移動平均は利用可能な件数で計算する（window 未満のうちは前方の平均）", () => {
    const out = buildTrend(
      [
        summary({ sessionId: "a", startedAt: "2026-08-20T00:00:00.000Z", total: 60 }),
        summary({ sessionId: "b", startedAt: "2026-08-21T00:00:00.000Z", total: 80 }),
        summary({ sessionId: "c", startedAt: "2026-08-22T00:00:00.000Z", total: 40 }),
      ],
      2,
    );
    // a: 60 / b: (60+80)/2=70 / c: (80+40)/2=60
    expect(out.points.map((p) => p.movingAvg)).toEqual([60, 70, 60]);
  });

  it("delta は最初と最後の total スコア差", () => {
    const out = buildTrend([
      summary({ sessionId: "a", startedAt: "2026-08-20T00:00:00.000Z", total: 55 }),
      summary({ sessionId: "b", startedAt: "2026-08-21T00:00:00.000Z", total: 72 }),
    ]);
    expect(out.delta).toBe(17);
  });

  it("点が 0 件なら delta 0", () => {
    const out = buildTrend([]);
    expect(out.points).toEqual([]);
    expect(out.delta).toBe(0);
  });

  it("点が 1 件なら delta 0", () => {
    const out = buildTrend([summary({ total: 88 })]);
    expect(out.delta).toBe(0);
  });

  it("同時刻は sessionId で安定ソートする", () => {
    const out = buildTrend([
      summary({ sessionId: "b", startedAt: "2026-08-25T00:00:00.000Z" }),
      summary({ sessionId: "a", startedAt: "2026-08-25T00:00:00.000Z" }),
    ]);
    expect(out.points.map((p) => p.sessionId)).toEqual(["a", "b"]);
  });

  it("パースできない時刻の点は末尾に寄せる", () => {
    const out = buildTrend([
      summary({ sessionId: "bad", startedAt: "not-a-date" }),
      summary({ sessionId: "ok", startedAt: "2026-08-25T00:00:00.000Z" }),
    ]);
    expect(out.points.map((p) => p.sessionId)).toEqual(["ok", "bad"]);
  });

  it("windowSize が 0 以下でも 1 として扱う", () => {
    const out = buildTrend(
      [
        summary({ sessionId: "a", startedAt: "2026-08-20T00:00:00.000Z", total: 60 }),
        summary({ sessionId: "b", startedAt: "2026-08-21T00:00:00.000Z", total: 80 }),
      ],
      0,
    );
    // window=1 なので移動平均 = その点自身
    expect(out.points.map((p) => p.movingAvg)).toEqual([60, 80]);
  });
});
