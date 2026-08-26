// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionDetail } from "./SessionDetail.js";
import type { SessionDetailResponse } from "../shared/types.js";

function detail(
  overrides: Partial<SessionDetailResponse["score"]> = {},
): SessionDetailResponse {
  return {
    metrics: {
      sessionId: "s1",
      cwd: "/Users/x/work/cinch",
      projectName: "cinch",
      startedAt: "2026-08-25T14:03:00.000Z",
      endedAt: "2026-08-25T14:33:00.000Z",
      durationMs: 1_800_000,
      assistantTurns: 38,
      models: { "claude-opus-5": 30, "claude-sonnet-5": 8 },
      totals: {
        input: 1000,
        output: 20_000,
        cacheCreate: 50_000,
        cacheCreate1h: 50_000,
        cacheCreate5m: 0,
        cacheRead: 400_000,
      },
      toolCalls: 47,
      toolErrors: 12,
      toolsByName: { Bash: { calls: 20, errors: 10 }, Read: { calls: 27, errors: 2 } },
      redundantReads: 5,
      parallelizableSequences: 2,
      parallelizableOpportunities: 10,
      sidechainTurns: 4,
      heavyExplorationTurns: 6,
      simpleWorkTurns: 12,
      simpleWorkOnExpensiveModel: 3,
      contextGrowth: [1000, 5000, 9000],
      cacheExpirations: 1,
      cache1hCreations: 4,
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
      parseErrors: 3,
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
        {
          id: "redundant-file-reads",
          category: "productivity",
          earned: 3,
          max: 8,
          evidence: "編集を挟まずに同じファイルを読み直した回数 5 回。",
          advice: "一度読んだファイルの内容は文脈に残っています。",
        },
        {
          id: "parallel-tool-use",
          category: "productivity",
          earned: 8,
          max: 8,
          evidence: "独立した呼び出しは並列化されています。",
          advice: null,
        },
      ],
      ...overrides,
    },
  };
}

describe("SessionDetail", () => {
  it("合計スコアを表示する", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    expect(screen.getByText("64")).toBeInTheDocument();
  });

  it("カテゴリ別スコアを日本語名と earned / max で表示する", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    expect(screen.getByText("生産性")).toBeInTheDocument();
    expect(screen.getByText("18 / 35")).toBeInTheDocument();
  });

  it("ルール名を日本語で表示する", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    expect(screen.getByText("ツールエラー率")).toBeInTheDocument();
    expect(screen.getByText("冗長なファイル読み込み")).toBeInTheDocument();
  });

  it("evidence を表示する", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    expect(screen.getByText(/47 回中 12 回が失敗/)).toBeInTheDocument();
  });

  it("advice がある行だけ改善案を表示する", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    expect(screen.getByText(/Bash の引数を実行前に確認/)).toBeInTheDocument();
    expect(screen.getAllByText(/^→/)).toHaveLength(2);
  });

  it("満点のルールに ✓、減点のあるルールに ✗ アイコンを付ける", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    const marks = screen.getAllByTestId("rule-mark");
    const ok = marks.filter((m) => m.getAttribute("data-ok") === "true");
    const ng = marks.filter((m) => m.getAttribute("data-ok") === "false");
    expect(ng).toHaveLength(2);
    expect(ok).toHaveLength(1);
  });

  it("減点のあるルールを先に並べる", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    const labels = screen.getAllByTestId("rule-label").map((el) => el.textContent);
    expect(labels[labels.length - 1]).toBe("ツール呼び出しの並列化");
  });

  it("メタ情報（ターン数・所要時間・モデル・バージョン）を表示する", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    expect(screen.getByText(/38/)).toBeInTheDocument();
    expect(screen.getByText(/30分/)).toBeInTheDocument();
    expect(screen.getByText(/claude-opus-5/)).toBeInTheDocument();
    expect(screen.getByText(/2\.1\.243/)).toBeInTheDocument();
  });

  it("parseErrors があれば件数を表示する", () => {
    render(<SessionDetail data={detail()} onBack={() => {}} />);
    expect(screen.getByText(/3 行/)).toBeInTheDocument();
  });

  it("戻るボタンで onBack が呼ばれる", async () => {
    const onBack = vi.fn();
    render(<SessionDetail data={detail()} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: /一覧に戻る/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("gradable: false なら採点対象外の説明を出しルール一覧を出さない", () => {
    const data = detail({ gradable: false, total: 0, rules: [] });
    render(<SessionDetail data={data} onBack={() => {}} />);
    expect(screen.getAllByText(/採点対象外/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("rule-label")).toBeNull();
  });
});
