import type {
  Category,
  RuleTrendBucket,
  RuleTrendPoint,
  RuleTrendsResponse,
  TrendWindowOption,
} from "../shared/types.js";

/** buildRuleTrends に渡す 1 セッション分の入力。evidence / advice は含めない。 */
export interface RuleTrendSessionInput {
  sessionId: string;
  projectName: string;
  startedAt: string;
  gradable: boolean;
  rules: { id: string; category: Category; earned: number; max: number }[];
}

export interface IsoWeek {
  year: number;
  week: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ISO 8601 の週番号（木曜日ルール）を求める。
 * その日を含む週の木曜日が属する年を「週の年」とし、その年の第 1 木曜日を含む週を
 * 第 1 週として数える。ライブラリを使わないゼロ実装。
 * パースできない時刻は null。
 */
export function isoWeek(iso: string): IsoWeek | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;

  const d = new Date(t);
  // UTC の日付だけを見た「その日の 0 時」に丸める（時刻成分は週の判定に無関係）。
  const date = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

  // 月曜=0 … 日曜=6 になるよう補正し、その週の木曜日（+3 日）を求める。
  const dow = (new Date(date).getUTCDay() + 6) % 7;
  const thursday = date + (3 - dow) * DAY_MS;
  const thursdayDate = new Date(thursday);
  const isoYear = thursdayDate.getUTCFullYear();

  // isoYear の 1 月 4 日は必ず第 1 週に含まれる（ISO 8601 の定義）。
  // その週の月曜日を第 1 週の開始点とする。
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4Dow * DAY_MS;

  const week = Math.round((thursday - week1Monday) / (7 * DAY_MS)) + 1;
  return { year: isoYear, week };
}

/** "2026-W05" 形式のキー。パースできない時刻は null。 */
export function isoWeekKey(iso: string): string | null {
  const w = isoWeek(iso);
  if (w === null) return null;
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** delta 昇順（悪化が大きい順）。null は末尾に寄せる。 */
function byDeltaAscNullsLast(a: RuleTrendBucket, b: RuleTrendBucket): number {
  if (a.delta === null && b.delta === null) return 0;
  if (a.delta === null) return 1;
  if (b.delta === null) return -1;
  return a.delta - b.delta;
}

/** セッション群からルール id → category の対応表を作る（最初に見つかったものを採用）。 */
function collectRuleMeta(
  sessions: RuleTrendSessionInput[],
): Map<string, Category> {
  const meta = new Map<string, Category>();
  for (const s of sessions) {
    for (const r of s.rules) {
      if (!meta.has(r.id)) meta.set(r.id, r.category);
    }
  }
  return meta;
}

function insufficientResponse(
  projectName: string,
  bucketKind: "week" | "session-window",
  windowSize: number | null,
  message: string,
): RuleTrendsResponse {
  return {
    projectName,
    bucketKind,
    windowSize,
    hasEnoughData: false,
    message,
    rules: [],
  };
}

/**
 * 採点済みセッションを、プロジェクト × ルール × バケットで group-by し、
 * sum(earned) / sum(max) の獲得率推移と直近バケット比のデルタを組み立てる。
 *
 * - gradable:false は集計から除外する。
 * - projectName に一致しないセッションは無視する。
 * - `opts.bucketKind === "week"`（既定）: startedAt の ISO 8601 週（木曜日ルール）で
 *   バケットを切る。データのある週が 2 つ未満なら hasEnoughData: false。
 * - `opts.bucketKind === "session-window"`: startedAt 昇順で末尾 N 件を current、
 *   その手前 N 件を previous とする（N = `opts.windowSize`、既定 5）。
 *   current / previous のどちらかが空なら hasEnoughData: false。
 *
 * 純粋関数。UI・fs を介さずテストできる。
 */
export function buildRuleTrends(
  sessions: RuleTrendSessionInput[],
  projectName: string,
  opts: TrendWindowOption = { bucketKind: "week" },
): RuleTrendsResponse {
  const graded = sessions.filter(
    (s) => s.gradable && s.projectName === projectName,
  );

  if (graded.length === 0) {
    return insufficientResponse(
      projectName,
      opts.bucketKind,
      opts.bucketKind === "session-window" ? (opts.windowSize ?? 5) : null,
      `${projectName} には採点済みセッションがありません。`,
    );
  }

  if (opts.bucketKind === "session-window") {
    return buildSessionWindowRuleTrends(graded, projectName, opts.windowSize ?? 5);
  }
  return buildWeeklyRuleTrends(graded, projectName);
}

function buildWeeklyRuleTrends(
  graded: RuleTrendSessionInput[],
  projectName: string,
): RuleTrendsResponse {
  type WeekBucket = {
    sessions: number;
    rules: Map<string, { earned: number; max: number }>;
  };
  const byWeek = new Map<string, WeekBucket>();

  for (const s of graded) {
    const wk = isoWeekKey(s.startedAt);
    if (wk === null) continue;
    let bucket = byWeek.get(wk);
    if (bucket === undefined) {
      bucket = { sessions: 0, rules: new Map() };
      byWeek.set(wk, bucket);
    }
    bucket.sessions += 1;
    for (const r of s.rules) {
      const cell = bucket.rules.get(r.id) ?? { earned: 0, max: 0 };
      cell.earned += r.earned;
      cell.max += r.max;
      bucket.rules.set(r.id, cell);
    }
  }

  const weeks = [...byWeek.keys()].sort((a, b) => a.localeCompare(b));

  if (weeks.length < 2) {
    return insufficientResponse(
      projectName,
      "week",
      null,
      `週次推移を計算するには、データのある週が 2 つ以上必要です（現在 ${weeks.length} 週）。`,
    );
  }

  const ruleMeta = collectRuleMeta(graded);

  const rules: RuleTrendBucket[] = [...ruleMeta.entries()].map(
    ([id, category]) => {
      const points: RuleTrendPoint[] = weeks.map((wk) => {
        const bucket = byWeek.get(wk)!;
        const cell = bucket.rules.get(id) ?? { earned: 0, max: 0 };
        const rate = cell.max > 0 ? round3(cell.earned / cell.max) : null;
        return {
          bucketKey: wk,
          earned: cell.earned,
          max: cell.max,
          rate,
          sessions: bucket.sessions,
        };
      });

      const n = points.length;
      const last = points[n - 1];
      const prev = points[n - 2];
      const delta =
        last !== undefined &&
        prev !== undefined &&
        last.rate !== null &&
        prev.rate !== null
          ? round3(last.rate - prev.rate)
          : null;

      return { id, category, points, delta };
    },
  );

  rules.sort(byDeltaAscNullsLast);

  return {
    projectName,
    bucketKind: "week",
    windowSize: null,
    hasEnoughData: true,
    rules,
  };
}

function aggregateRuleBucket(
  bucketSessions: RuleTrendSessionInput[],
): Map<string, { earned: number; max: number }> {
  const map = new Map<string, { earned: number; max: number }>();
  for (const s of bucketSessions) {
    for (const r of s.rules) {
      const cell = map.get(r.id) ?? { earned: 0, max: 0 };
      cell.earned += r.earned;
      cell.max += r.max;
      map.set(r.id, cell);
    }
  }
  return map;
}

function buildSessionWindowRuleTrends(
  graded: RuleTrendSessionInput[],
  projectName: string,
  n: number,
): RuleTrendsResponse {
  const sorted = graded
    .map((s) => ({ s, t: Date.parse(s.startedAt) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t)
    .map((x) => x.s);

  const current = sorted.slice(-n);
  const previous = sorted.slice(-2 * n, -n);

  if (current.length === 0 || previous.length === 0) {
    return insufficientResponse(
      projectName,
      "session-window",
      n,
      `直近 ${n} 件ずつの比較には採点済みセッションが ${n * 2} 件必要です（現在 ${graded.length} 件）。`,
    );
  }

  const ruleMeta = collectRuleMeta(graded);
  const prevAgg = aggregateRuleBucket(previous);
  const curAgg = aggregateRuleBucket(current);

  const rules: RuleTrendBucket[] = [...ruleMeta.entries()].map(
    ([id, category]) => {
      const prevCell = prevAgg.get(id) ?? { earned: 0, max: 0 };
      const curCell = curAgg.get(id) ?? { earned: 0, max: 0 };
      const prevRate =
        prevCell.max > 0 ? round3(prevCell.earned / prevCell.max) : null;
      const curRate =
        curCell.max > 0 ? round3(curCell.earned / curCell.max) : null;

      const points: RuleTrendPoint[] = [
        {
          bucketKey: "previous",
          earned: prevCell.earned,
          max: prevCell.max,
          rate: prevRate,
          sessions: previous.length,
        },
        {
          bucketKey: "current",
          earned: curCell.earned,
          max: curCell.max,
          rate: curRate,
          sessions: current.length,
        },
      ];

      const delta =
        prevRate !== null && curRate !== null
          ? round3(curRate - prevRate)
          : null;

      return { id, category, points, delta };
    },
  );

  rules.sort(byDeltaAscNullsLast);

  return {
    projectName,
    bucketKind: "session-window",
    windowSize: n,
    hasEnoughData: true,
    rules,
  };
}
