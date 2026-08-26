import type { SessionSummary } from "../shared/types.js";

export interface TrendPoint {
  sessionId: string;
  /** セッション開始時刻（ISO）。X 軸に使う */
  startedAt: string;
  /** そのセッションの total スコア（0〜100） */
  total: number;
  /** 直近 window 件の移動平均。点が足りないうちは利用可能な件数で平均する */
  movingAvg: number;
}

export interface Trend {
  points: TrendPoint[];
  /** 最初の採点済みセッションから最後までのスコア差（正なら改善） */
  delta: number;
}

/**
 * 採点済みセッションを開始時刻の昇順に並べ、スコア推移と移動平均を組み立てる。
 * 採点対象外（gradable: false）は推移の対象にしない。
 * 純粋関数。UI を介さずテストできる。
 */
export function buildTrend(
  sessions: SessionSummary[],
  windowSize = 5,
): Trend {
  const w = Math.max(1, Math.floor(windowSize));

  const ordered = sessions
    .filter((s) => s.gradable)
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.startedAt);
      const tb = Date.parse(b.startedAt);
      // パースできない時刻は末尾へ寄せる（NaN 比較を避ける）
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      if (ta !== tb) return ta - tb;
      return a.sessionId.localeCompare(b.sessionId);
    });

  const points: TrendPoint[] = ordered.map((s, i) => {
    const from = Math.max(0, i - w + 1);
    const slice = ordered.slice(from, i + 1);
    const movingAvg =
      slice.reduce((sum, x) => sum + x.total, 0) / slice.length;
    return {
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      total: s.total,
      movingAvg: Math.round(movingAvg * 10) / 10,
    };
  });

  const first = points[0];
  const last = points[points.length - 1];
  const delta =
    first !== undefined && last !== undefined
      ? Math.round((last.total - first.total) * 10) / 10
      : 0;

  return { points, delta };
}
