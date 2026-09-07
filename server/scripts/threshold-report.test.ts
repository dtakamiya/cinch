import { describe, expect, it } from "vitest";
import type { EvaluatedRule, SessionScore } from "../../shared/types.js";
import { metricsFixture } from "../rules/testHelpers.js";
import type { AnalyzedSession } from "../analyze.js";
import {
  aggregateRuleStats,
  applyFilters,
  buildReport,
  detectWarnings,
  histogram,
  mean,
  parseArgs,
  quantile,
  stdev,
  summarizeDistribution,
  type ReportFilters,
  type RuleStat,
} from "./threshold-report.js";

// ---- テスト用ヘルパー ----

function evaluatedRule(
  id: string,
  earned: number,
  max: number,
): EvaluatedRule {
  return { id, category: "cost", earned, max, evidence: "", advice: null };
}

function scoreOf(
  rules: EvaluatedRule[],
  opts: { total?: number; gradable?: boolean } = {},
): SessionScore {
  return {
    sessionId: "s",
    total: opts.total ?? 0,
    gradable: opts.gradable ?? true,
    categories: {
      cost: { earned: 0, max: 0 },
      productivity: { earned: 0, max: 0 },
      practice: { earned: 0, max: 0 },
    },
    rules,
  };
}

function analyzedOf(
  projectName: string,
  startedAt: string,
  score: SessionScore,
): AnalyzedSession {
  return { metrics: metricsFixture({ projectName, startedAt }), score };
}

function ruleStatStub(overrides: Partial<RuleStat>): RuleStat {
  return {
    id: "r",
    category: "cost",
    weight: 10,
    gradableCount: 100,
    fireCount: 40,
    fireRate: 0.4,
    perfectCount: 60,
    perfectRate: 0.6,
    avgDeductionAll: 2,
    avgDeductionWhenFired: 5,
    maxDeduction: 10,
    deductionHistogram: [],
    ...overrides,
  };
}

// ---- quantile ----

describe("quantile", () => {
  it("空配列は 0", () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it("1 要素はどの分位でもその値", () => {
    expect(quantile([42], 0)).toBe(42);
    expect(quantile([42], 0.5)).toBe(42);
    expect(quantile([42], 1)).toBe(42);
  });

  it("[1..5] の分位点を線形補間で返す", () => {
    const s = [1, 2, 3, 4, 5];
    expect(quantile(s, 0)).toBe(1);
    expect(quantile(s, 0.25)).toBe(2);
    expect(quantile(s, 0.5)).toBe(3);
    expect(quantile(s, 0.75)).toBe(4);
    expect(quantile(s, 1)).toBe(5);
    expect(quantile(s, 0.1)).toBeCloseTo(1.4, 10);
    expect(quantile(s, 0.9)).toBeCloseTo(4.6, 10);
  });

  it("q は [0,1] にクランプされる", () => {
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 5)).toBe(3);
  });
});

// ---- mean / stdev ----

describe("mean / stdev", () => {
  it("mean: 空配列は 0", () => {
    expect(mean([])).toBe(0);
  });

  it("mean: 平均を返す", () => {
    expect(mean([2, 4, 6])).toBe(4);
  });

  it("stdev: 2 件未満は 0", () => {
    expect(stdev([])).toBe(0);
    expect(stdev([5])).toBe(0);
  });

  it("stdev: 標本標準偏差（n-1）を返す", () => {
    // 分散 = 32 / 7 → sqrt ≈ 2.13809
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
  });
});

// ---- summarizeDistribution ----

describe("summarizeDistribution", () => {
  it("並び順に依存せず分位を計算する", () => {
    const d = summarizeDistribution([5, 1, 4, 2, 3]);
    expect(d.count).toBe(5);
    expect(d.min).toBe(1);
    expect(d.max).toBe(5);
    expect(d.p25).toBe(2);
    expect(d.median).toBe(3);
    expect(d.p75).toBe(4);
    expect(d.mean).toBe(3);
  });

  it("空集合はすべて 0", () => {
    const d = summarizeDistribution([]);
    expect(d).toMatchObject({
      count: 0,
      min: 0,
      max: 0,
      median: 0,
      mean: 0,
      stdev: 0,
    });
  });
});

// ---- histogram ----

describe("histogram", () => {
  const opts = { min: 0, max: 100, bucketSize: 10 };

  it("0-100 を 10 バケットに刻む", () => {
    expect(histogram([], opts)).toHaveLength(10);
  });

  it("値を正しいバケットに数える", () => {
    const h = histogram([0, 5, 10, 15, 99, 100], opts);
    expect(h[0]).toMatchObject({ rangeStart: 0, rangeEnd: 10, count: 2 }); // 0, 5
    expect(h[1]).toMatchObject({ rangeStart: 10, rangeEnd: 20, count: 2 }); // 10, 15
    expect(h[9]).toMatchObject({ rangeStart: 90, rangeEnd: 100, count: 2 }); // 99, 100
  });

  it("境界値は上のバケットへ、max ちょうどは末尾へ", () => {
    const h = histogram([10], opts);
    expect(h[0]?.count).toBe(0);
    expect(h[1]?.count).toBe(1);
    const h2 = histogram([100], opts);
    expect(h2[9]?.count).toBe(1);
  });

  it("範囲外の値は端のバケットに寄せる", () => {
    const h = histogram([-5, 150], opts);
    expect(h[0]?.count).toBe(1);
    expect(h[9]?.count).toBe(1);
  });
});

// ---- aggregateRuleStats ----

describe("aggregateRuleStats", () => {
  const defs = [{ id: "r1", category: "cost", weight: 10 }];

  it("発火率・満点率・平均減点・最大減点を集計する", () => {
    const scores = [
      scoreOf([evaluatedRule("r1", 10, 10)]), // 減点なし
      scoreOf([evaluatedRule("r1", 0, 10)]), // 全減点 10
      scoreOf([evaluatedRule("r1", 7, 10)]), // 減点 3
      scoreOf([evaluatedRule("r1", 10, 10)]), // 減点なし
    ];
    const [s] = aggregateRuleStats(scores, defs);
    expect(s).toBeDefined();
    expect(s?.gradableCount).toBe(4);
    expect(s?.fireCount).toBe(2);
    expect(s?.fireRate).toBe(0.5);
    expect(s?.perfectCount).toBe(2);
    expect(s?.perfectRate).toBe(0.5);
    expect(s?.avgDeductionAll).toBeCloseTo((0 + 10 + 3 + 0) / 4, 10);
    expect(s?.avgDeductionWhenFired).toBeCloseTo((10 + 3) / 2, 10);
    expect(s?.maxDeduction).toBe(10);
  });

  it("減点分布は発火時のみを 減点/weight の割合で 4 分割する", () => {
    const scores = [
      scoreOf([evaluatedRule("r1", 10, 10)]), // 0% -> 分布に含めない
      scoreOf([evaluatedRule("r1", 8, 10)]), // 20% -> bucket0
      scoreOf([evaluatedRule("r1", 7, 10)]), // 30% -> bucket1
      scoreOf([evaluatedRule("r1", 4, 10)]), // 60% -> bucket2
      scoreOf([evaluatedRule("r1", 0, 10)]), // 100% -> bucket3
    ];
    const [s] = aggregateRuleStats(scores, defs);
    expect(s?.deductionHistogram.map((b) => b.count)).toEqual([1, 1, 1, 1]);
  });

  it("対象ルールを含まないスコアは母数から除く", () => {
    const scores = [
      scoreOf([evaluatedRule("other", 0, 5)]),
      scoreOf([evaluatedRule("r1", 0, 10)]),
    ];
    const [s] = aggregateRuleStats(scores, defs);
    expect(s?.gradableCount).toBe(2);
    expect(s?.fireCount).toBe(1);
  });
});

// ---- detectWarnings ----

describe("detectWarnings", () => {
  it("発火率 0% は rule-never-fires", () => {
    const w = detectWarnings([ruleStatStub({ id: "subagent-delegation", fireRate: 0 })]);
    expect(w).toHaveLength(1);
    expect(w[0]?.code).toBe("rule-never-fires");
    expect(w[0]?.ruleId).toBe("subagent-delegation");
  });

  it("発火率 98.8% は rule-fires-too-often", () => {
    const w = detectWarnings([ruleStatStub({ id: "cache-ttl-waste", fireRate: 0.988 })]);
    expect(w).toHaveLength(1);
    expect(w[0]?.code).toBe("rule-fires-too-often");
    expect(w[0]?.ruleId).toBe("cache-ttl-waste");
  });

  it("既知の両極端（cache-ttl-waste 98.8% / subagent-delegation 0.0%）が同時に警告される", () => {
    const w = detectWarnings([
      ruleStatStub({ id: "cache-ttl-waste", fireRate: 0.988 }),
      ruleStatStub({ id: "subagent-delegation", fireRate: 0 }),
      ruleStatStub({ id: "tool-error-rate", fireRate: 0.35 }),
    ]);
    expect(w.map((x) => `${x.ruleId}:${x.code}`)).toEqual([
      "cache-ttl-waste:rule-fires-too-often",
      "subagent-delegation:rule-never-fires",
    ]);
  });

  it("中間の発火率は警告しない", () => {
    expect(detectWarnings([ruleStatStub({ fireRate: 0.4 })])).toEqual([]);
  });

  it("発火率が僅少なら rule-fires-rarely", () => {
    const w = detectWarnings([ruleStatStub({ fireRate: 0.01 })]);
    expect(w[0]?.code).toBe("rule-fires-rarely");
  });

  it("母数 0 のルールは警告対象外", () => {
    expect(detectWarnings([ruleStatStub({ gradableCount: 0, fireRate: 0 })])).toEqual([]);
  });
});

// ---- applyFilters ----

describe("applyFilters", () => {
  const sessions = [
    analyzedOf("cinch", "2026-08-10T00:00:00.000Z", scoreOf([])),
    analyzedOf("cinch", "2026-08-20T00:00:00.000Z", scoreOf([])),
    analyzedOf("other", "2026-08-20T00:00:00.000Z", scoreOf([])),
  ];

  it("フィルタなしは全件通す", () => {
    expect(applyFilters(sessions, { projects: null, since: null, until: null })).toHaveLength(3);
  });

  it("projectName で絞り込む", () => {
    const r = applyFilters(sessions, { projects: ["cinch"], since: null, until: null });
    expect(r).toHaveLength(2);
    expect(r.every((a) => a.metrics.projectName === "cinch")).toBe(true);
  });

  it("since は境界を含み、それより前を落とす", () => {
    const r = applyFilters(sessions, {
      projects: null,
      since: "2026-08-20T00:00:00.000Z",
      until: null,
    });
    expect(r).toHaveLength(2);
  });

  it("until は境界を含まず、それ以降を落とす", () => {
    const r = applyFilters(sessions, {
      projects: null,
      since: null,
      until: "2026-08-20T00:00:00.000Z",
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.metrics.startedAt).toBe("2026-08-10T00:00:00.000Z");
  });
});

// ---- buildReport ----

describe("buildReport", () => {
  const filters: ReportFilters = {
    projects: null,
    since: null,
    until: null,
    root: "/tmp/x",
  };

  it("gradable 別のセッション数と満点率・0点率を集計する", () => {
    const analyzed = [
      analyzedOf("p", "2026-08-01T00:00:00.000Z", scoreOf([evaluatedRule("r1", 10, 10)], { total: 100 })),
      analyzedOf("p", "2026-08-01T00:00:00.000Z", scoreOf([evaluatedRule("r1", 0, 10)], { total: 0 })),
      analyzedOf("p", "2026-08-01T00:00:00.000Z", scoreOf([], { total: 0, gradable: false })),
    ];
    const r = buildReport(analyzed, 2, filters, new Date("2026-09-07T00:00:00.000Z"));
    expect(r.sessionCounts).toEqual({ scanned: 3, gradable: 2, nonGradable: 1, skipped: 2 });
    expect(r.overallScore.perfectRate).toBe(0.5);
    expect(r.overallScore.zeroRate).toBe(0.5);
    expect(r.overallScore.median).toBe(50);
    expect(r.overallScore.count).toBe(2);
    expect(r.generatedAt).toBe("2026-09-07T00:00:00.000Z");
  });

  it("gradable が 0 件でも例外にならず count 0 を返す", () => {
    const analyzed = [
      analyzedOf("p", "2026-08-01T00:00:00.000Z", scoreOf([], { gradable: false })),
    ];
    const r = buildReport(analyzed, 0, filters);
    expect(r.sessionCounts.gradable).toBe(0);
    expect(r.overallScore.count).toBe(0);
    expect(r.overallScore.perfectRate).toBe(0);
    expect(r.overallScore.histogram).toHaveLength(10);
  });
});

// ---- parseArgs ----

describe("parseArgs", () => {
  it("既定値", () => {
    const o = parseArgs([]);
    expect(o.json).toBe(false);
    expect(o.help).toBe(false);
    expect(o.projects).toBeNull();
    expect(o.since).toBeNull();
    expect(typeof o.root).toBe("string");
  });

  it("--json / --help", () => {
    expect(parseArgs(["--json"]).json).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("--project はカンマ区切りと複数指定をマージする", () => {
    expect(parseArgs(["--project", "cinch,foo", "--project", "bar"]).projects).toEqual([
      "cinch",
      "foo",
      "bar",
    ]);
  });

  it("--key=value 形式を受け付ける", () => {
    expect(parseArgs(["--project=cinch"]).projects).toEqual(["cinch"]);
    expect(parseArgs(["--since=2026-08-01"]).since).toBe("2026-08-01");
  });

  it("不正な日付は例外", () => {
    expect(() => parseArgs(["--since", "not-a-date"])).toThrow(/日付/);
  });

  it("値なしフラグは例外", () => {
    expect(() => parseArgs(["--project"])).toThrow(/値が必要/);
  });

  it("不明な引数は例外", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/不明な引数/);
  });
});
