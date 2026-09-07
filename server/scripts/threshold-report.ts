/**
 * threshold-report — 採点閾値チューニング支援スクリプト（読み取り専用・LLM 呼び出しなし）
 *
 * 既存の parse→metrics→rules→score パイプライン（`analyzeAll`）を read-only で呼び、
 * 実セッション群の総合スコア分布・ルール別発火統計・警告を集計して stdout に出す。
 * 採点ロジック（metrics.ts / rules/*.ts / score.ts / config/thresholds.ts）は一切変更しない。
 * 会話本文は出力しない（プロジェクト名と数値統計のみ）。
 *
 * 使い方:
 *   npm run threshold-report                       人間可読の表を出力
 *   npm run threshold-report -- --json             構造化 JSON を出力
 *   npm run threshold-report -- --project cinch    projectName で絞り込み（カンマ区切り / 複数指定可）
 *   npm run threshold-report -- --since 2026-08-01 --until 2026-09-01
 *                                                  startedAt で期間絞り込み（since <= t < until）
 *   npm run threshold-report -- --root /path/to/projects
 *                                                  走査ルートを差し替え（既定: ~/.claude/projects）
 *
 * --json 出力のキー名は安定契約。cron ジョブ "cinch-threshold-audit"（~/.ryoko/cron/jobs.json）の
 * prompt がこれらのキーをパースする。具体的には以下:
 *   generatedAt / filters.{projects,since,until,root}
 *   sessionCounts.{scanned,gradable,nonGradable,skipped}
 *   overallScore.{min,p10,p25,median,p75,p90,max,mean,stdev,count,perfectRate,zeroRate}
 *   overallScore.histogram[].{rangeStart,rangeEnd,count}
 *   rules[].{id,category,weight,gradableCount,fireCount,fireRate,perfectCount,perfectRate,
 *            avgDeductionAll,avgDeductionWhenFired,maxDeduction}
 *   rules[].deductionHistogram[].{lostFractionStart,lostFractionEnd,count}
 *   warnings[].{code,ruleId,fireRate,message}
 * これらのキー名を変更・削除・改名するときは jobs.json の "cinch-threshold-audit" prompt も
 * 併せて更新すること。
 */

import { pathToFileURL } from "node:url";
import { analyzeAll, type AnalyzedSession } from "../analyze.js";
import { defaultRoot } from "../discover.js";
import { ALL_RULES } from "../rules/index.js";
import type { SessionScore } from "../../shared/types.js";

// 浮動小数の丸め誤差を吸収する比較用イプシロン。
const EPSILON = 1e-9;

// ---- 純粋な集計関数（threshold-report.test.ts でテストする） ----

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 昇順ソート済み配列の分位点を線形補間で求める。空配列は 0。 */
export function quantile(sortedAsc: readonly number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const first = sortedAsc[0] ?? 0;
  if (n === 1) return first;
  const pos = (n - 1) * clamp(q, 0, 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sortedAsc[base] ?? first;
  const upper = sortedAsc[base + 1] ?? lower;
  return lower + rest * (upper - lower);
}

/** 算術平均。空配列は 0。 */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 標本標準偏差（n-1 で割る）。2 件未満は 0。 */
export function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export interface DistributionSummary {
  count: number;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  mean: number;
  stdev: number;
}

/** 値の集合を分位点・平均・標準偏差にまとめる。入力の並び順は問わない。 */
export function summarizeDistribution(
  values: readonly number[],
): DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    count: n,
    min: n > 0 ? (sorted[0] ?? 0) : 0,
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: n > 0 ? (sorted[n - 1] ?? 0) : 0,
    mean: mean(sorted),
    stdev: stdev(sorted),
  };
}

export interface HistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
}

/**
 * 等幅ヒストグラム。`[min, max)` を `bucketSize` 幅で刻む。
 * min 未満は先頭、max 以上（max ちょうどを含む）は末尾のバケットに寄せる。
 */
export function histogram(
  values: readonly number[],
  opts: { min: number; max: number; bucketSize: number },
): HistogramBucket[] {
  const { min, max, bucketSize } = opts;
  const bucketCount = Math.max(1, Math.round((max - min) / bucketSize));
  const buckets: HistogramBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      rangeStart: min + i * bucketSize,
      rangeEnd: min + (i + 1) * bucketSize,
      count: 0,
    });
  }
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    let idx = Math.floor((v - min) / bucketSize);
    if (idx < 0) idx = 0;
    if (idx >= bucketCount) idx = bucketCount - 1;
    const b = buckets[idx];
    if (b !== undefined) b.count++;
  }
  return buckets;
}

export interface RuleDeductionBucket {
  lostFractionStart: number;
  lostFractionEnd: number;
  count: number;
}

export interface RuleStat {
  id: string;
  category: string;
  weight: number;
  gradableCount: number;
  fireCount: number;
  fireRate: number;
  perfectCount: number;
  perfectRate: number;
  avgDeductionAll: number;
  avgDeductionWhenFired: number;
  maxDeduction: number;
  /** 発火したセッションのみを対象にした「減点 / weight」の分布 */
  deductionHistogram: RuleDeductionBucket[];
}

/** 発火時の減点割合（lost / weight）を 4 分割したヒストグラム。 */
function ruleDeductionHistogram(
  firedLosts: readonly number[],
  weight: number,
): RuleDeductionBucket[] {
  const buckets: RuleDeductionBucket[] = [
    { lostFractionStart: 0, lostFractionEnd: 0.25, count: 0 },
    { lostFractionStart: 0.25, lostFractionEnd: 0.5, count: 0 },
    { lostFractionStart: 0.5, lostFractionEnd: 0.75, count: 0 },
    { lostFractionStart: 0.75, lostFractionEnd: 1, count: 0 },
  ];
  for (const lost of firedLosts) {
    const frac = weight > 0 ? lost / weight : 0;
    let idx = Math.floor(frac / 0.25);
    if (idx < 0) idx = 0;
    if (idx > 3) idx = 3;
    const b = buckets[idx];
    if (b !== undefined) b.count++;
  }
  return buckets;
}

export interface RuleDef {
  id: string;
  category: string;
  weight: number;
}

/**
 * gradable なセッションのスコアからルール別統計を集計する。
 * 「発火」= そのルールで減点（max - earned > 0）が発生したセッション。
 */
export function aggregateRuleStats(
  gradableScores: readonly SessionScore[],
  ruleDefs: readonly RuleDef[] = ALL_RULES,
): RuleStat[] {
  const gradableCount = gradableScores.length;
  return ruleDefs.map((def) => {
    const losts: number[] = [];
    for (const score of gradableScores) {
      const r = score.rules.find((x) => x.id === def.id);
      if (r === undefined) continue;
      losts.push(Math.max(0, r.max - r.earned));
    }
    const fired = losts.filter((l) => l > EPSILON);
    const perfectCount = losts.length - fired.length;
    return {
      id: def.id,
      category: def.category,
      weight: def.weight,
      gradableCount,
      fireCount: fired.length,
      fireRate: gradableCount > 0 ? fired.length / gradableCount : 0,
      perfectCount,
      perfectRate: gradableCount > 0 ? perfectCount / gradableCount : 0,
      avgDeductionAll: mean(losts),
      avgDeductionWhenFired: fired.length > 0 ? mean(fired) : 0,
      maxDeduction: losts.reduce((mx, l) => (l > mx ? l : mx), 0),
      deductionHistogram: ruleDeductionHistogram(fired, def.weight),
    };
  });
}

export type WarningCode =
  | "rule-never-fires"
  | "rule-fires-rarely"
  | "rule-fires-too-often";

export interface Warning {
  code: WarningCode;
  ruleId: string;
  fireRate: number;
  message: string;
}

export interface WarningThresholds {
  /** 発火率がこれ以下なら「一度も発火していない」扱い */
  neverFires: number;
  /** 発火率がこれ以下なら「ほとんど発火しない」扱い */
  rarelyFires: number;
  /** 発火率がこれ以上なら「ほぼ常に発火する」扱い */
  firesTooOften: number;
}

/**
 * 警告判定の閾値。これは採点用ではなく「レポートの注意喚起」用の値なので、
 * server/config/thresholds.ts ではなくこのスクリプト内に置く（採点ロジックには触れない）。
 */
export const DEFAULT_WARNING_THRESHOLDS: WarningThresholds = {
  neverFires: 0,
  rarelyFires: 0.02,
  firesTooOften: 0.9,
};

function pctText(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** 発火率が極端に低い / 高いルールを警告として抽出する。 */
export function detectWarnings(
  ruleStats: readonly RuleStat[],
  thresholds: WarningThresholds = DEFAULT_WARNING_THRESHOLDS,
): Warning[] {
  const out: Warning[] = [];
  for (const s of ruleStats) {
    if (s.gradableCount === 0) continue;
    if (s.fireRate <= thresholds.neverFires) {
      out.push({
        code: "rule-never-fires",
        ruleId: s.id,
        fireRate: s.fireRate,
        message: `${s.id} は一度も発火していません（発火率 ${pctText(s.fireRate)}、対象 ${s.gradableCount} 件）。閾値が緩すぎて減点が起きていない可能性があります。`,
      });
    } else if (s.fireRate <= thresholds.rarelyFires) {
      out.push({
        code: "rule-fires-rarely",
        ruleId: s.id,
        fireRate: s.fireRate,
        message: `${s.id} はほとんど発火していません（発火率 ${pctText(s.fireRate)}、対象 ${s.gradableCount} 件）。判別力があるか確認してください。`,
      });
    }
    if (s.fireRate >= thresholds.firesTooOften) {
      out.push({
        code: "rule-fires-too-often",
        ruleId: s.id,
        fireRate: s.fireRate,
        message: `${s.id} はほぼ全セッションで発火しています（発火率 ${pctText(s.fireRate)}、対象 ${s.gradableCount} 件）。閾値が厳しすぎるか、全体傾向を写しているだけで判別力が無い可能性があります。`,
      });
    }
  }
  return out;
}

export interface ReportFilters {
  projects: string[] | null;
  since: string | null;
  until: string | null;
  root: string;
}

/** projectName の一致と startedAt の範囲（since <= t < until）で絞り込む純粋関数。 */
export function applyFilters(
  analyzed: readonly AnalyzedSession[],
  filters: Pick<ReportFilters, "projects" | "since" | "until">,
): AnalyzedSession[] {
  const sinceMs = filters.since !== null ? Date.parse(filters.since) : null;
  const untilMs = filters.until !== null ? Date.parse(filters.until) : null;
  const projectSet =
    filters.projects !== null && filters.projects.length > 0
      ? new Set(filters.projects)
      : null;
  return analyzed.filter((a) => {
    if (projectSet !== null && !projectSet.has(a.metrics.projectName)) {
      return false;
    }
    const startedMs = Date.parse(a.metrics.startedAt);
    if (Number.isNaN(startedMs)) {
      // startedAt を解釈できないセッションは、期間指定があるときだけ除外する。
      return sinceMs === null && untilMs === null;
    }
    if (sinceMs !== null && startedMs < sinceMs) return false;
    if (untilMs !== null && startedMs >= untilMs) return false;
    return true;
  });
}

export interface Report {
  generatedAt: string;
  filters: ReportFilters;
  sessionCounts: {
    scanned: number;
    gradable: number;
    nonGradable: number;
    skipped: number;
  };
  overallScore: DistributionSummary & {
    perfectRate: number;
    zeroRate: number;
    histogram: HistogramBucket[];
  };
  rules: RuleStat[];
  warnings: Warning[];
}

/** 解析済みセッション（フィルタ適用後）から最終レポートを組み立てる純粋関数。 */
export function buildReport(
  analyzed: readonly AnalyzedSession[],
  skippedCount: number,
  filters: ReportFilters,
  now: Date = new Date(),
): Report {
  const gradable = analyzed.filter((a) => a.score.gradable);
  const totals = gradable.map((a) => a.score.total);
  const dist = summarizeDistribution(totals);
  const perfect = totals.filter((t) => t >= 100 - EPSILON).length;
  const zero = totals.filter((t) => t <= EPSILON).length;
  const scores = gradable.map((a) => a.score);
  const rules = aggregateRuleStats(scores);
  return {
    generatedAt: now.toISOString(),
    filters,
    sessionCounts: {
      scanned: analyzed.length,
      gradable: gradable.length,
      nonGradable: analyzed.length - gradable.length,
      skipped: skippedCount,
    },
    overallScore: {
      ...dist,
      perfectRate: gradable.length > 0 ? perfect / gradable.length : 0,
      zeroRate: gradable.length > 0 ? zero / gradable.length : 0,
      histogram: histogram(totals, { min: 0, max: 100, bucketSize: 10 }),
    },
    rules,
    warnings: detectWarnings(rules),
  };
}

// ---- CLI ----

export interface CliOptions {
  json: boolean;
  help: boolean;
  projects: string[] | null;
  since: string | null;
  until: string | null;
  root: string;
}

/** argv（`process.argv.slice(2)` 相当）をオプションに変換する。不正な引数は例外。 */
export function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = {
    json: false,
    help: false,
    projects: null,
    since: null,
    until: null,
    root: defaultRoot(),
  };

  // --key=value を --key value に展開する。
  const flat: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--") && arg.includes("=")) {
      const eq = arg.indexOf("=");
      flat.push(arg.slice(0, eq), arg.slice(eq + 1));
    } else {
      flat.push(arg);
    }
  }

  const needValue = (name: string, v: string | undefined): string => {
    if (v === undefined) throw new Error(`${name} には値が必要です`);
    return v;
  };

  for (let i = 0; i < flat.length; i++) {
    const arg = flat[i];
    switch (arg) {
      case "--json":
        opts.json = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--project": {
        const v = needValue("--project", flat[++i]);
        const names = v
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        opts.projects = [...(opts.projects ?? []), ...names];
        break;
      }
      case "--since":
        opts.since = needValue("--since", flat[++i]);
        break;
      case "--until":
        opts.until = needValue("--until", flat[++i]);
        break;
      case "--root":
        opts.root = needValue("--root", flat[++i]);
        break;
      default:
        throw new Error(`不明な引数: ${String(arg)}`);
    }
  }

  for (const [name, val] of [
    ["--since", opts.since],
    ["--until", opts.until],
  ] as const) {
    if (val !== null && Number.isNaN(Date.parse(val))) {
      throw new Error(`${name} の日付を解釈できません: ${val}`);
    }
  }
  return opts;
}

const HELP = `threshold-report — 採点閾値チューニング支援（読み取り専用）

  npm run threshold-report [-- <options>]

options:
  --json               構造化 JSON を出力（キー名は安定契約。スクリプト冒頭コメント参照）
  --project <names>     projectName で絞り込み（カンマ区切り / 複数指定可）
  --since <date>        startedAt がこの日時以降のセッションのみ
  --until <date>        startedAt がこの日時より前のセッションのみ
  --root <path>         走査ルート（既定: ~/.claude/projects）
  -h, --help            このヘルプ
`;

/** JSON 出力時、非整数は小数第 4 位で丸めてキー横断の安定性を確保する。 */
function roundingReplacer(_key: string, value: unknown): unknown {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Number.isInteger(value)
  ) {
    return Math.round(value * 10000) / 10000;
  }
  return value;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => (row[i] ?? "").length)),
  );
  const line = (cells: string[]): string =>
    "  " + cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  const sep = "  " + widths.map((w) => "-".repeat(w)).join("  ");
  return [line(headers), sep, ...rows.map(line)].join("\n");
}

/** 人間可読の表形式レポート。 */
export function renderText(r: Report): string {
  const L: string[] = [];
  const f = r.filters;
  L.push("cinch 閾値チューニングレポート");
  L.push(`生成: ${r.generatedAt}`);
  L.push(`走査ルート: ${f.root}`);
  L.push(
    `フィルタ: project=${f.projects && f.projects.length > 0 ? f.projects.join(",") : "(なし)"} since=${f.since ?? "(なし)"} until=${f.until ?? "(なし)"}`,
  );
  L.push(
    `セッション: 走査 ${r.sessionCounts.scanned} / 採点対象 ${r.sessionCounts.gradable} / 対象外 ${r.sessionCounts.nonGradable} / スキップ ${r.sessionCounts.skipped}`,
  );
  L.push("");

  if (r.sessionCounts.gradable === 0) {
    L.push("採点対象セッションが 0 件です。フィルタ条件を見直してください。");
    return L.join("\n");
  }

  const os = r.overallScore;
  L.push("■ 総合スコア分布");
  L.push(
    table(
      ["統計量", "値"],
      [
        ["min", fmt(os.min)],
        ["p10", fmt(os.p10)],
        ["p25", fmt(os.p25)],
        ["median", fmt(os.median)],
        ["p75", fmt(os.p75)],
        ["p90", fmt(os.p90)],
        ["max", fmt(os.max)],
        ["mean", fmt(os.mean)],
        ["stdev", fmt(os.stdev)],
        ["満点率 (total=100)", pctText(os.perfectRate)],
        ["0点率 (total=0)", pctText(os.zeroRate)],
      ],
    ),
  );
  L.push("");

  L.push("■ 総合スコア ヒストグラム");
  const maxCount = Math.max(1, ...os.histogram.map((b) => b.count));
  for (const b of os.histogram) {
    const bar = "#".repeat(Math.round((b.count / maxCount) * 40));
    L.push(
      `  ${String(b.rangeStart).padStart(3)}-${String(b.rangeEnd).padStart(3)} | ${String(b.count).padStart(4)} ${bar}`,
    );
  }
  L.push("");

  L.push("■ ルール別統計（発火 = そのルールで減点が発生したセッション）");
  L.push(
    table(
      [
        "rule",
        "cat",
        "weight",
        "発火率",
        "満点率",
        "平均減点(全体)",
        "平均減点(発火時)",
        "最大減点",
      ],
      r.rules.map((s) => [
        s.id,
        s.category,
        String(s.weight),
        pctText(s.fireRate),
        pctText(s.perfectRate),
        fmt(s.avgDeductionAll),
        fmt(s.avgDeductionWhenFired),
        fmt(s.maxDeduction),
      ]),
    ),
  );
  L.push("");

  L.push("■ ルール別 減点分布（発火時の 減点/weight 割合ごとの件数）");
  L.push(
    table(
      ["rule", "0-25%", "25-50%", "50-75%", "75-100%"],
      r.rules.map((s) => [
        s.id,
        ...s.deductionHistogram.map((b) => String(b.count)),
      ]),
    ),
  );
  L.push("");

  L.push("■ 警告");
  if (r.warnings.length === 0) {
    L.push("  なし");
  } else {
    for (const w of r.warnings) L.push(`  [${w.code}] ${w.message}`);
  }
  return L.join("\n");
}

async function main(argv: readonly string[]): Promise<void> {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }

  const result = await analyzeAll(opts.root);
  if (!result.rootExists) {
    process.stderr.write(
      `セッションログのルートが見つかりません: ${opts.root}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const filters: ReportFilters = {
    projects: opts.projects,
    since: opts.since,
    until: opts.until,
    root: opts.root,
  };
  const filtered = applyFilters(result.sessions, filters);
  const report = buildReport(filtered, result.skipped.length, filters);

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, roundingReplacer, 2) + "\n");
  } else {
    process.stdout.write(renderText(report) + "\n");
  }
}

// tsx / node から直接起動されたときだけ main を走らせる。
// import（テスト）では副作用を起こさない。
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}
