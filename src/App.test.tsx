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
    editCalls: 0,
    verificationCalls: 0,
    bashInsteadOfTool: 0,
    bashInsteadOfToolByCommand: {},
    peakContextTokens: 0,
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
  window.location.hash = "";
  mockFetch((url) => (url.includes("/api/sessions/") ? detailResponse : listResponse));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("App", () => {
  it("読み込み中の表示を出す", () => {
    render(<App />);
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
  });

  it("一覧を取得して表示する", async () => {
    render(<App />);
    const card = await screen.findByRole("link", { name: /cinch/ });
    expect(within(card).getByText("64")).toBeInTheDocument();
  });

  it("カードのリンクを開くと詳細を取得して表示する", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /cinch/ }));
    expect(await screen.findByText(/47 回中 12 回が失敗/)).toBeInTheDocument();
    expect(window.location.hash).toBe("#/session/s1");
  });

  it("#/session/<id> で始めると詳細をそのまま復元する（リロード相当）", async () => {
    window.location.hash = "#/session/s1";
    render(<App />);
    expect(await screen.findByText(/47 回中 12 回が失敗/)).toBeInTheDocument();
  });

  it("ヘッダのベンチマークリンクで #/benchmark に遷移し横断テーブルを出す", async () => {
    render(<App />);
    await screen.findByText("cinch");
    await userEvent.click(screen.getByRole("link", { name: /ベンチマーク/ }));
    expect(window.location.hash).toBe("#/benchmark");
    expect(
      await screen.findByText(/プロジェクト横断ベンチマーク/),
    ).toBeInTheDocument();
  });

  it("#/benchmark で始めると同じ GET /api/sessions を使って復元する", async () => {
    window.location.hash = "#/benchmark";
    render(<App />);
    expect(
      await screen.findByText(/プロジェクト横断ベンチマーク/),
    ).toBeInTheDocument();
  });

  it("ベンチマークの行リンクから #/?project=<name> で絞り込み一覧に戻る", async () => {
    window.location.hash = "#/benchmark";
    render(<App />);
    await screen.findByText(/プロジェクト横断ベンチマーク/);
    await userEvent.click(screen.getByRole("link", { name: "cinch" }));
    expect(window.location.hash).toBe("#/?project=cinch");
    // 一覧に戻り、プロジェクト select が cinch に設定されている
    const select = await screen.findByRole("combobox", { name: /プロジェクト/ });
    expect((select as HTMLSelectElement).value).toBe("cinch");
  });

  it("詳細から一覧に戻れる", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /cinch/ }));
    await screen.findByText(/47 回中 12 回が失敗/);
    await userEvent.click(await screen.findByRole("link", { name: /一覧に戻る/ }));
    await waitFor(() => {
      expect(screen.getByText("主な減点")).toBeInTheDocument();
    });
  });

  it("ブラウザバック（hash を空に戻す）で一覧に戻る", async () => {
    window.location.hash = "#/session/s1";
    render(<App />);
    await screen.findByText(/47 回中 12 回が失敗/);
    window.location.hash = "";
    await waitFor(() => {
      expect(screen.getByText("主な減点")).toBeInTheDocument();
    });
  });

  it("存在しない sessionId の詳細では 404 表示と一覧に戻る導線を出す", async () => {
    mockFetch(
      (url) =>
        url.includes("/api/sessions/")
          ? { error: "セッションが見つかりません" }
          : listResponse,
      false,
    );
    window.location.hash = "#/session/missing";
    render(<App />);
    expect(await screen.findByText(/セッションが見つかりません/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /一覧に戻る/ })).toHaveAttribute(
      "href",
      "#/",
    );
  });

  it("詳細 fetch の解決前に一覧へ戻っても『読み込み中…』が残らない", async () => {
    // 詳細 fetch だけ手動で解決できるよう保留させる
    let resolveDetail: (v: unknown) => void = () => {};
    const detailPromise = new Promise((res) => {
      resolveDetail = res;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/sessions/")) {
          return {
            ok: true,
            status: 200,
            json: async () => {
              await detailPromise;
              return detailResponse;
            },
          };
        }
        return { ok: true, status: 200, json: async () => listResponse };
      }),
    );

    render(<App />);
    // 一覧が出るまで待ってからカードを開く（list はキャッシュ済みにする）
    await userEvent.click(await screen.findByRole("link", { name: /cinch/ }));
    // 詳細 fetch 未解決なので「読み込み中…」が出る（詳細本文はまだ）
    expect(await screen.findByText(/読み込み中/)).toBeInTheDocument();
    expect(screen.queryByText(/47 回中 12 回が失敗/)).toBeNull();

    // fetch 未解決のまま一覧へ戻る（ブラウザバック相当）
    window.location.hash = "";
    await waitFor(() => {
      expect(screen.getByText("主な減点")).toBeInTheDocument();
    });
    expect(screen.queryByText(/読み込み中/)).toBeNull();

    // 後から詳細 fetch が解決しても一覧のままで loading は戻らない
    resolveDetail(detailResponse);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("主な減点")).toBeInTheDocument();
    expect(screen.queryByText(/読み込み中/)).toBeNull();
  });

  it("404 詳細から一覧へ戻ると古いエラーバナーが消える（list キャッシュ済み）", async () => {
    // list 取得は常に成功、詳細 fetch だけ 404 にする
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const isDetail = String(url).includes("/api/sessions/");
        return {
          ok: !isDetail,
          status: isDetail ? 404 : 200,
          json: async () =>
            isDetail ? { error: "セッションが見つかりません" } : listResponse,
        };
      }),
    );

    render(<App />);
    // 一覧をキャッシュしてから 404 になる詳細を開く
    await userEvent.click(await screen.findByRole("link", { name: /cinch/ }));
    await screen.findByText(/セッションが見つかりません/);

    // list はキャッシュ済みなので back で loadList は走らない
    await userEvent.click(screen.getByRole("link", { name: /一覧に戻る/ }));
    await waitFor(() => {
      expect(screen.getByText("主な減点")).toBeInTheDocument();
    });
    expect(screen.queryByText(/セッションが見つかりません/)).toBeNull();
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

  it("一覧では自動更新トグルが出て、デフォルトで ON", async () => {
    render(<App />);
    await screen.findByText("cinch");
    const toggle = screen.getByRole("checkbox", { name: /自動更新/ });
    expect(toggle).toBeChecked();
  });

  it("詳細画面では自動更新トグルを出さない", async () => {
    window.location.hash = "#/session/s1";
    render(<App />);
    await screen.findByText(/47 回中 12 回が失敗/);
    expect(screen.queryByRole("checkbox", { name: /自動更新/ })).toBeNull();
  });

  it("自動更新の間隔でバックグラウンド再取得する（loading は出さない）", async () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      // 初回ロードを進める
      await vi.runOnlyPendingTimersAsync();
      const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } })
        .mock.calls.length;

      // 30 秒経過させる
      await vi.advanceTimersByTimeAsync(30_000);

      const after = (globalThis.fetch as unknown as { mock: { calls: unknown[] } })
        .mock.calls.length;
      expect(after).toBeGreaterThan(before);
      // 静かな更新なので全画面の「読み込み中…」は出ない
      expect(screen.queryByText(/読み込み中/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("自動更新を OFF にするとポーリングが止まる", async () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      await vi.runOnlyPendingTimersAsync();

      // トグルを OFF にする（fake timer 下なので fireEvent を使う）
      const toggle = screen.getByRole("checkbox", { name: /自動更新/ });
      toggle.click();

      const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } })
        .mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      const after = (globalThis.fetch as unknown as { mock: { calls: unknown[] } })
        .mock.calls.length;
      expect(after).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
