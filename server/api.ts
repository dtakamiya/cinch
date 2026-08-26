import express from "express";
import type { SessionsResponse, SessionDetailResponse } from "../shared/types.js";
import { analyzeAll, toSummary } from "./analyze.js";
import { AnalysisCache } from "./cache.js";
import { defaultRoot } from "./discover.js";

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

  return app;
}
