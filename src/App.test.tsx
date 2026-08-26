// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.js";
import type { SessionsResponse, SessionDetailResponse } from "../shared/types.js";

const listResponse: SessionsResponse = {
  sessions: [
    {
      sessionId: "s1",
      projectName: "cinch",
      cwd: "/Users/x/work/cinch",
      startedAt: "2026-08-25T14:03:00.000Z",
      durationMs: 1_800_000,
      assistantTurns: 38,
      total: 64,
      gradable: true,
      categories: {
        cost: { earned: 25, max: 35 },
        productivity: { earned: 18, max: 35 },
        practice: { earned: 21, max: 30 },
      },
      topDeduction: { id: "tool-error-rate", lost: 10 },
    },
  ],
  scannedAt: "2026-08-25T15:00:00.000Z",
  projectCount: 1,
  skipped: [],
};

const detailResponse: SessionDetailResponse = {
  metrics: {
    sessionId: "s1",
    cwd: "/Users/x/work/cinch",
    projectName: "cinch",
    startedAt: "2026-08-25T14:03:00.000Z",
    endedAt: "2026-08-25T14:33:00.000Z",
    durationMs: 1_800_000,
    assistantTurns: 38,
    models: { "claude-opus-5": 38 },
    totals: {
      input: 100, output: 200, cacheCreate: 0,
      cacheCreate1h: 0, cacheCreate5m: 0, cacheRead: 0,
    },
    toolCalls: 47,
    toolErrors: 12,
    toolsByName: {},
    redundantReads: 0,
    parallelizableSequences: 0,
    parallelizableOpportunities: 0,
    sidechainTurns: 0,
    heavyExplorationTurns: 0,
    simpleWorkTurns: 0,
    simpleWorkOnExpensiveModel: 0,
    contextGrowth: [],
    cacheExpirations: 0,
    cache1hCreations: 0,
    hasClaudeMd: true,
    gitBranch: "main",
    version: "2.1.243",
    oversizedResults: 0,
    largestResultBytes: 0,
    largestResultTool: null,
    parseErrors: 0,
  },
  score: {
    sessionId: "s1",
    total: 64,
    gradable: true,
    categories: {
      cost: { earned: 25, max: 35 },
      productivity: { earned: 18, max: 35 },
      practice: { earned: 21, max: 30 },
    },
    rules: [
      {
        id: "tool-error-rate",
        category: "productivity",
        earned: 2,
        max: 12,
        evidence: "ツール呼び出し 47 回中 12 回が失敗（25.5%）。",
        advice: "Bash の引数を実行前に確認してください。",
      },
    ],
  },
};

function mockFetch(handler: (url: string) => unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => handler(String(url)),
    })),
  );
}

beforeEach(() => {
  mockFetch((url) => (url.includes("/api/sessions/") ? detailResponse : listResponse));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("読み込み中の表示を出す", () => {
    render(<App />);
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
  });

  it("一覧を取得して表示する", async () => {
    render(<App />);
    const card = await screen.findByRole("button", { name: /cinch/ });
    expect(within(card).getByText("64")).toBeInTheDocument();
  });

  it("行をクリックすると詳細を取得して表示する", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /cinch/ }));
    expect(await screen.findByText(/47 回中 12 回が失敗/)).toBeInTheDocument();
  });

  it("詳細から一覧に戻れる", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /cinch/ }));
    await userEvent.click(await screen.findByRole("button", { name: /一覧に戻る/ }));
    await waitFor(() => {
      expect(screen.getByText("主な減点")).toBeInTheDocument();
    });
  });

  it("再スキャンボタンで一覧を取り直す", async () => {
    render(<App />);
    await screen.findByText("cinch");
    const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: /再スキャン/ }));
    await waitFor(() => {
      const after = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("取得に失敗したらエラーメッセージを出す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ネットワークエラー"); }));
    render(<App />);
    expect(await screen.findByText(/ネットワークエラー/)).toBeInTheDocument();
  });
});
