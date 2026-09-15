import express from "express";
import type {
  SessionsResponse,
  SessionDetailResponse,
  RuleTrendsResponse,
  TrendWindowOption,
} from "../shared/types.js";
import { analyzeAll, toSummary } from "./analyze.js";
import { buildRuleTrends, type RuleTrendSessionInput } from "./aggregate.js";
import type { AnalyzedSession } from "./cache.js";
import { AnalysisCache } from "./cache.js";
import { defaultRoot } from "./discover.js";

const WINDOW_SIZES = [3, 5, 10] as const;

/** query の bucket / windowSize を検証して TrendWindowOption に正規化する。不正値は既定にフォールバックする。 */
function parseTrendWindowOption(query: express.Request["query"]): TrendWindowOption {
  const bucketKind = query.bucket === "session-window" ? "session-window" : "week";
  if (bucketKind === "week") return { bucketKind: "week" };

  const raw = Number(query.windowSize);
  const windowSize = (WINDOW_SIZES as readonly number[]).includes(raw)
    ? (raw as 3 | 5 | 10)
    : 5;
  return { bucketKind: "session-window", windowSize };
}

/** buildRuleTrends に渡す入力（evidence / advice を含めない）に変換する。 */
function toRuleTrendInput(a: AnalyzedSession): RuleTrendSessionInput {
  return {
    sessionId: a.metrics.sessionId,
    projectName: a.metrics.projectName,
    startedAt: a.metrics.startedAt,
    gradable: a.score.gradable,
    rules: a.score.rules.map((r) => ({
      id: r.id,
      category: r.category,
      earned: r.earned,
      max: r.max,
    })),
  };
}

export interface AppOptions {
  root?: string;
  cache?: AnalysisCache;
}

const NO_ROOT_MESSAGE =
  "セッションログのディレクトリが見つかりません。Claude Code を一度も使っていないか、~/.claude/projects が別の場所にあります。";

/**
 * Express アプリを組み立てる。listen はしない（テストから直接叩けるようにするため）。
 * listen は index.ts が 127.0.0.1 に対してのみ行う。
 */
export function createApp(options: AppOptions = {}): express.Express {
  const root = options.root ?? defaultRoot();
  const cache = options.cache ?? new AnalysisCache();
  const app = express();

  app.get("/api/sessions", async (_req, res) => {
    const result = await analyzeAll(root, cache);

    // 一覧のソート順がスコアに依存するため、全件を採点したうえで並べ替える
    const sessions = result.sessions
      .map(toSummary)
      .sort((a, b) => {
        if (a.gradable !== b.gradable) return a.gradable ? -1 : 1;
        if (b.total !== a.total) return b.total - a.total;
        return b.startedAt.localeCompare(a.startedAt);
      });

    const body: SessionsResponse = {
      sessions,
      scannedAt: new Date().toISOString(),
      projectCount: result.projectCount,
      skipped: result.skipped,
    };
    if (!result.rootExists) body.message = NO_ROOT_MESSAGE;

    res.json(body);
  });

  app.get("/api/sessions/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    const result = await analyzeAll(root, cache);
    // sessionId をパスに連結せず、解析済みの一覧から一致するものを探す。
    // これによりパストラバーサルが原理的に起こらない。
    const found = result.sessions.find((s) => s.metrics.sessionId === sessionId);

    if (found === undefined) {
      res.status(404).json({ error: `セッション ${sessionId} が見つかりません。` });
      return;
    }

    const body: SessionDetailResponse = {
      metrics: found.metrics,
      score: found.score,
    };
    res.json(body);
  });

  // ルール別スコア推移（cinch-023）。projectName 絞りは、共有 AnalysisCache を渡して
  // analyzeAll(root, cache) を呼び直し、返った結果配列を解析済みメタ情報の
  // projectName で突き合わせて絞る方式にする（discover 段階では絞らない）。
  app.get("/api/projects/:projectName/rule-trends", async (req, res) => {
    const { projectName } = req.params;
    const opts = parseTrendWindowOption(req.query);

    const result = await analyzeAll(root, cache);
    const input = result.sessions.map(toRuleTrendInput);

    const body: RuleTrendsResponse = buildRuleTrends(input, projectName, opts);
    res.json(body);
  });

  return app;
}
