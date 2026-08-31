import { CATEGORIES, type Category } from "../shared/types.js";
import type { SessionSummary } from "../shared/types.js";

/**
 * プロジェクト横断ベンチマークの集計。
 *
 * 入力は GET /api/sessions の SessionSummary[] のみ。新エンドポイント・
 * shared/types.ts の型変更なしで動く（cinch-016 AC9）。
 */

/** 採点済みが N 件未満なら中央値・分布・箱ひげを出さない（AC6）。1 箇所だけで定義する。 */
export const MIN_GRADED_FOR_STATS = 3;

/** 前後半の悪化検知の閾値（獲得率ポイント。0.1 = 10pt 悪化で警告）（AC7）。 */
export const CATEGORY_DECLINE_THRESHOLD = 0.1;

export type BenchmarkPeriod = "all" | "1d" | "7d" | "30d";

export interface BenchmarkFilters {
  period: BenchmarkPeriod;
}

const PERIOD_DAYS: Record<BenchmarkPeriod, number | null> = {
  all: null,
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

/** 箱ひげ用の 5 数要約。母数不足のときは null。 */
export interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

/** カテゴリ別の悪化検知結果。 */
export interface CategoryDecline {
  category: Category;
  /** 前半平均獲得率 */
  firstHalf: number;
  /** 後半平均獲得率 */
  secondHalf: number;
  /** secondHalf - firstHalf（負なら悪化） */
  delta: number;
}

export interface BenchmarkRow {
  projectName: string;
  /** 採点済みセッション数（gradable のみ。母数 N 未満でもここには数える）（AC5/AC6） */
  gradedCount: number;
  /** 総合スコア中央値。母数 N 未満なら null（AC6） */
  medianScore: number | null;
  /** 総合スコアの箱ひげ 5 数。母数 N 未満なら null（AC6） */
  box: BoxStats | null;
  /** カテゴリ別 獲得率（earned/max 合算）の中央値。母数 N 未満なら全カテゴリ null（AC6） */
  categoryMedian: Record<Category, number | null>;
  /** 最頻の topDeduction（id と件数）。該当なし（全 null）のときは null（AC2） */
  topDeduction: { id: string; count: number } | null;
  /** 前後半デルタが閾値超で悪化しているカテゴリ（AC7） */
  declines: CategoryDecline[];
}

export interface Benchmark {
  rows: BenchmarkRow[];
  /** フィルタ適用後に 1 件以上採点済みが残ったプロジェクト数 */
  projectCount: number;
}

/** ソートキー。総合スコア中央値のほか、件数・各カテゴリ率で切り替えられる（AC3）。 */
export type BenchmarkSortKey =
  | "median"
  | "count"
  | "cost"
  | "productivity"
  | "practice";

/** 昇順（下手な順）が既定。null は常に末尾へ寄せる。 */
export function sortBenchmarkRows(
  rows: BenchmarkRow[],
  key: BenchmarkSortKey,
  direction: "asc" | "desc" = "asc",
): BenchmarkRow[] {
  const dir = direction === "asc" ? 1 : -1;
  const valueOf = (r: BenchmarkRow): number | null => {
    if (key === "count") return r.gradedCount;
    if (key === "median") return r.medianScore;
    return r.categoryMedian[key];
  };
  return [...rows].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    // null は方向に関係なく末尾
    if (va === null && vb === null) return a.projectName.localeCompare(b.projectName);
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va !== vb) return (va - vb) * dir;
    return a.projectName.localeCompare(b.projectName);
  });
}

/**
 * ソート済みの数値配列から線形補間の分位を返す。
 * p は 0〜1。空配列は 0。
 */
export function quantileSorted(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const pos = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return quantileSorted(sorted, 0.5);
}

/** 5 数要約。空配列は null。 */
export function boxStats(values: number[]): BoxStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0]!,
    q1: quantileSorted(sorted, 0.25),
    median: quantileSorted(sorted, 0.5),
    q3: quantileSorted(sorted, 0.75),
    max: sorted[sorted.length - 1]!,
  };
}

/** そのカテゴリの合算獲得率（sum(earned) / sum(max)）。max 合計 0 なら 0。 */
function categoryRate(sessions: SessionSummary[], category: Category): number {
  let earned = 0;
  let max = 0;
  for (const s of sessions) {
    earned += s.categories[category].earned;
    max += s.categories[category].max;
  }
  return max > 0 ? earned / max : 0;
}

/** 1 セッションのカテゴリ獲得率（earned/max、max 0 なら 0）。中央値計算用。 */
function sessionCategoryRate(s: SessionSummary, category: Category): number {
  const { earned, max } = s.categories[category];
  return max > 0 ? earned / max : 0;
}

function detectDeclines(orderedByTime: SessionSummary[]): CategoryDecline[] {
  const n = orderedByTime.length;
  // 前後半に割るには最低 2 件必要
  if (n < 2) return [];
  const mid = Math.floor(n / 2);
  const firstHalf = orderedByTime.slice(0, mid);
  const secondHalf = orderedByTime.slice(mid);
  if (firstHalf.length === 0 || secondHalf.length === 0) return [];

  const out: CategoryDecline[] = [];
  for (const category of CATEGORIES) {
    const a = categoryRate(firstHalf, category);
    const b = categoryRate(secondHalf, category);
    const delta = b - a;
    if (delta <= -CATEGORY_DECLINE_THRESHOLD) {
      out.push({
        category,
        firstHalf: round3(a),
        secondHalf: round3(b),
        delta: round3(delta),
      });
    }
  }
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function withinPeriod(startedAt: string, cutoff: number | null): boolean {
  if (cutoff === null) return true;
  const t = Date.parse(startedAt);
  return Number.isFinite(t) && t >= cutoff;
}

/**
 * プロジェクトごとに集計する。
 *
 * - 期間フィルタ（all / 1d / 7d / 30d）で再集計し、期間内に採点済みが無い
 *   プロジェクトは行に含めない（AC4）。
 * - gradable:false（total:0・categories 全 {earned:0,max:0}）は中央値・分布・箱ひげ・
 *   カテゴリ中央値・悪化検知の計算から除外し、採点済み件数にのみ含める（AC5）。
 *   src/SessionList.tsx の .filter(s => s.gradable) パターンを流用。
 * - 採点済みが MIN_GRADED_FOR_STATS 件未満のプロジェクトは
 *   medianScore / box / categoryMedian を出さず（null）、gradedCount のみ持たせる（AC6）。
 * - topDeduction は s.topDeduction?.id で最頻集計。null は数えない（AC2）。
 *
 * 純粋関数。UI を介さずテストできる。
 */
export function buildBenchmark(
  sessions: SessionSummary[],
  filters: BenchmarkFilters,
): Benchmark {
  const days = PERIOD_DAYS[filters.period] ?? null;
  const cutoff = days === null ? null : Date.now() - days * 24 * 60 * 60 * 1000;

  // プロジェクト名 → 期間内セッション
  const byProject = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    if (!withinPeriod(s.startedAt, cutoff)) continue;
    const list = byProject.get(s.projectName);
    if (list === undefined) byProject.set(s.projectName, [s]);
    else list.push(s);
  }

  const rows: BenchmarkRow[] = [];
  for (const [projectName, all] of byProject) {
    const graded = all.filter((s) => s.gradable);
    // 期間内に採点済みが 1 件も無いプロジェクトは行に出さない（AC1: 採点済み1件以上）
    if (graded.length === 0) continue;

    const enoughForStats = graded.length >= MIN_GRADED_FOR_STATS;

    const scores = graded.map((s) => s.total);
    const medianScore = enoughForStats ? round1(median(scores)) : null;
    const box = enoughForStats ? boxStats(scores) : null;

    const categoryMedian = {} as Record<Category, number | null>;
    for (const category of CATEGORIES) {
      categoryMedian[category] = enoughForStats
        ? round3(median(graded.map((s) => sessionCategoryRate(s, category))))
        : null;
    }

    // topDeduction 最頻集計（id で数える。null は無視）
    const deductionCounts = new Map<string, number>();
    for (const s of graded) {
      const id = s.topDeduction?.id;
      if (id === undefined || id === null) continue;
      deductionCounts.set(id, (deductionCounts.get(id) ?? 0) + 1);
    }
    let topDeduction: { id: string; count: number } | null = null;
    for (const [id, count] of deductionCounts) {
      if (
        topDeduction === null ||
        count > topDeduction.count ||
        (count === topDeduction.count && id.localeCompare(topDeduction.id) < 0)
      ) {
        topDeduction = { id, count };
      }
    }

    // 悪化検知は時系列順に並べてから前後半で比較（AC7）
    const orderedByTime = [...graded].sort((a, b) => {
      const ta = Date.parse(a.startedAt);
      const tb = Date.parse(b.startedAt);
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      if (ta !== tb) return ta - tb;
      return a.sessionId.localeCompare(b.sessionId);
    });
    const declines = detectDeclines(orderedByTime);

    rows.push({
      projectName,
      gradedCount: graded.length,
      medianScore,
      box,
      categoryMedian,
      topDeduction,
      declines,
    });
  }

  // 既定は総合スコア中央値の昇順（下手な順）（AC3）
  const sorted = sortBenchmarkRows(rows, "median", "asc");
  return { rows: sorted, projectCount: sorted.length };
}
