import { CATEGORIES, type Category } from "../shared/types.js";
import type { SessionSummary } from "../shared/types.js";

/** 1 カテゴリ・1 週分の集計点。 */
export interface CategoryTrendPoint {
  /** その週の月曜 00:00:00 UTC（ISO）。X 軸のキーに使う */
  weekStart: string;
  /** その週にこのカテゴリで獲得した earned の合計 */
  earned: number;
  /** その週のこのカテゴリの max の合計 */
  max: number;
  /** earned / max（max が 0 の週は 0）。0〜1 */
  rate: number;
  /** その週に集計対象になった採点済みセッション数 */
  sessions: number;
}

export interface CategoryTrendSeries {
  category: Category;
  points: CategoryTrendPoint[];
  /**
   * 最終週の rate − 直前週の rate。
   * 週が 2 つ未満なら 0。正なら改善（獲得率が上がった）。
   */
  delta: number;
}

export interface CategoryTrends {
  projectName: string;
  /** 集計に使った採点済みセッション数（gradable:false は除外済み） */
  gradedCount: number;
  /** cost / productivity / practice の 3 系列。順序は shared/types.ts の CATEGORIES に従う */
  series: CategoryTrendSeries[];
}

/**
 * ISO 8601 の「週の始まり = 月曜」で、その時刻が属する週の月曜 00:00:00 UTC を返す。
 * パースできない時刻は null。
 */
export function weekStartUtc(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  // getUTCDay: 0=日 1=月 … 6=土。月曜を週頭にするので (day + 6) % 7 日戻す。
  const back = (d.getUTCDay() + 6) % 7;
  const monday = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - back,
  );
  return new Date(monday).toISOString();
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * プロジェクト内の採点済みセッションを、カテゴリ × 週で group-by し、
 * sum(earned) / sum(max) の獲得率推移と先週比デルタを組み立てる。
 *
 * - gradable:false（total:0・categories 全カテゴリ {earned:0,max:0}）は集計から明示除外する
 *   （src/SessionList.tsx / src/trend.ts の .filter(s => s.gradable) と同じパターン）。
 * - projectName に一致しないセッションは無視する。
 * - startedAt がパースできないセッションは週に割り当てられないので除外する。
 * - 週は「データのある週」だけを昇順で並べる（間の空き週は詰める）。
 *
 * 純粋関数。UI を介さずテストできる。
 */
export function buildCategoryTrends(
  sessions: SessionSummary[],
  projectName: string,
): CategoryTrends {
  const graded = sessions.filter(
    (s) => s.gradable && s.projectName === projectName,
  );

  // 週キー → カテゴリ → { earned, max, sessions }
  const byWeek = new Map<
    string,
    { sessions: number; cats: Record<Category, { earned: number; max: number }> }
  >();

  for (const s of graded) {
    const wk = weekStartUtc(s.startedAt);
    if (wk === null) continue;
    let bucket = byWeek.get(wk);
    if (bucket === undefined) {
      const cats = {} as Record<Category, { earned: number; max: number }>;
      for (const c of CATEGORIES) cats[c] = { earned: 0, max: 0 };
      bucket = { sessions: 0, cats };
      byWeek.set(wk, bucket);
    }
    bucket.sessions += 1;
    for (const c of CATEGORIES) {
      const cell = s.categories[c];
      bucket.cats[c].earned += cell.earned;
      bucket.cats[c].max += cell.max;
    }
  }

  const weeks = [...byWeek.keys()].sort((a, b) => a.localeCompare(b));

  const series: CategoryTrendSeries[] = CATEGORIES.map((category) => {
    const points: CategoryTrendPoint[] = weeks.map((wk) => {
      const bucket = byWeek.get(wk)!;
      const { earned, max } = bucket.cats[category];
      const rate = max > 0 ? earned / max : 0;
      return {
        weekStart: wk,
        earned,
        max,
        rate: round3(rate),
        sessions: bucket.sessions,
      };
    });

    const n = points.length;
    const delta =
      n >= 2 ? round3(points[n - 1]!.rate - points[n - 2]!.rate) : 0;

    return { category, points, delta };
  });

  return { projectName, gradedCount: graded.length, series };
}

/** delta の符号を返す（0 は flat）。UI のクラス切り替え用。 */
export function deltaDirection(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}
