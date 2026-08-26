import { readFile } from "node:fs/promises";
import type { SessionSummary, SkippedFile } from "../shared/types.js";
import type { AnalyzedSession } from "./cache.js";
import { AnalysisCache } from "./cache.js";
import {
  defaultRoot,
  discoverSessions,
  hasClaudeMd,
  type DiscoveredFile,
} from "./discover.js";
import { computeMetrics } from "./metrics.js";
import { parseLine } from "./parse.js";
import { computeScore, topDeduction } from "./score.js";
import type { Event } from "../shared/types.js";

export type { AnalyzedSession } from "./cache.js";

export interface AnalyzeAllResult {
  sessions: AnalyzedSession[];
  projectCount: number;
  skipped: SkippedFile[];
  rootExists: boolean;
}

/** 1 ファイルを読んで解析する。パース不能な行はスキップして数えるだけにする。 */
export async function analyzeFile(
  file: DiscoveredFile,
): Promise<AnalyzedSession> {
  const raw = await readFile(file.path, "utf8");

  const events: Event[] = [];
  let parseErrors = 0;
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    const event = parseLine(line);
    if (event !== null) {
      events.push(event);
      continue;
    }
    // JSON として読めない行だけをエラーに数える。
    // 未知の type は前方互換のため無視するだけで、エラーではない。
    if (!isValidJson(line)) parseErrors++;
  }

  // cwd はログ本文を優先し、無ければディレクトリ名からの復元を使う
  const cwdFromLog = events.find(
    (e): e is Extract<Event, { kind: "meta" }> => e.kind === "meta" && e.cwd !== "",
  )?.cwd;
  const cwd = cwdFromLog ?? file.fallbackCwd;

  const metrics = computeMetrics({
    sessionId: file.sessionId,
    events,
    parseErrors,
    hasClaudeMd: await hasClaudeMd(cwd),
    fallbackCwd: cwd,
  });

  return { metrics, score: computeScore(metrics) };
}

function isValidJson(line: string): boolean {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

/** 一覧用の軽量な要約。evidence / advice を含めない。 */
export function toSummary(a: AnalyzedSession): SessionSummary {
  return {
    sessionId: a.metrics.sessionId,
    projectName: a.metrics.projectName,
    cwd: a.metrics.cwd,
    startedAt: a.metrics.startedAt,
    durationMs: a.metrics.durationMs,
    assistantTurns: a.metrics.assistantTurns,
    total: a.score.total,
    gradable: a.score.gradable,
    categories: a.score.categories,
    topDeduction: topDeduction(a.score),
  };
}

/**
 * 全セッションを解析する。
 * 一覧のソート順がスコアに依存するため、全件の採点が必要になる。
 * キャッシュを渡すと mtime / size が変わったファイルだけ再解析する。
 */
export async function analyzeAll(
  root: string = defaultRoot(),
  cache?: AnalysisCache,
): Promise<AnalyzeAllResult> {
  const discovered = await discoverSessions(root);
  const skipped = [...discovered.skipped];
  const sessions: AnalyzedSession[] = [];

  for (const file of discovered.files) {
    const cached = cache?.get(file) ?? null;
    if (cached !== null) {
      sessions.push(cached);
      continue;
    }
    try {
      const analyzed = await analyzeFile(file);
      cache?.set(file, analyzed);
      sessions.push(analyzed);
    } catch (err) {
      skipped.push({
        path: file.path,
        reason: `解析に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return {
    sessions,
    projectCount: discovered.projectCount,
    skipped,
    rootExists: discovered.rootExists,
  };
}
