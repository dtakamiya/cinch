// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BenchmarkView } from "./BenchmarkView.js";
import type { SessionSummary, SessionsResponse } from "../shared/types.js";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "s1",
    projectName: "cinch",
    cwd: "/x/cinch",
    startedAt: "2026-08-25T10:00:00.000Z",
    durationMs: 1000,
    assistantTurns: 10,
    total: 70,
    gradable: true,
    categories: {
      cost: { earned: 20, max: 40 },
      productivity: { earned: 25, max: 35 },
      practice: { earned: 15, max: 30 },
    },
    topDeduction: { id: "tool-error-rate", lost: 9 },
    ...overrides,
  };
}

function response(sessions: SessionSummary[]): SessionsResponse {
  return { sessions, scannedAt: "", projectCount: 1, skipped: [] };
}

afterEach(() => {
  vi.useRealTimers();
});

/** alpha（中央値 85, 3件）と beta（中央値 45, 3件）の 2 プロジェクト。 */
function twoProjects(): SessionSummary[] {
  return [
    summary({ sessionId: "a1", projectName: "alpha", total: 90 }),
    summary({ sessionId: "a2", projectName: "alpha", total: 80 }),
    summary({ sessionId: "a3", projectName: "alpha", total: 85 }),
    summary({ sessionId: "b1", projectName: "beta", total: 40 }),
    summary({ sessionId: "b2", projectName: "beta", total: 50 }),
    summary({ sessionId: "b3", projectName: "beta", total: 45 }),
  ];
}

describe("Benchmark", () => {
  it("採点済み 1 件以上の全プロジェクトが 1 テーブルに並ぶ（既定は下手な順）", () => {
    render(<BenchmarkView data={response(twoProjects())} />);
    const rowHeaders = screen
      .getAllByRole("row")
      .slice(1) // ヘッダ行を除く
      .map((tr) => within(tr).getByRole("link").textContent);
    expect(rowHeaders).toEqual(["beta", "alpha"]);
  });

  it("採点済みが無ければ空メッセージを出す", () => {
    render(<BenchmarkView data={response([])} />);
    expect(
      screen.getByText(/採点済みセッションのあるプロジェクトはありません/),
    ).toBeInTheDocument();
  });

  it("総合スコア中央値を表示する", () => {
    render(<BenchmarkView data={response(twoProjects())} />);
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("母数 N 件未満のプロジェクトは中央値を — にし件数のみ出す", () => {
    render(
      <BenchmarkView
        data={response([
          summary({ sessionId: "t1", projectName: "tiny", total: 30 }),
          summary({ sessionId: "t2", projectName: "tiny", total: 90 }),
        ])}
      />,
    );
    const tinyRow = screen.getByRole("link", { name: "tiny" }).closest("tr")!;
    expect(within(tinyRow).getByText("2")).toBeInTheDocument();
    // 中央値セルは —
    expect(within(tinyRow).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("並び替えを件数に切り替えられる", () => {
    render(
      <BenchmarkView
        data={response([
          summary({ sessionId: "a1", projectName: "alpha", total: 85 }),
          summary({ sessionId: "a2", projectName: "alpha", total: 85 }),
          summary({ sessionId: "a3", projectName: "alpha", total: 85 }),
          summary({ sessionId: "a4", projectName: "alpha", total: 85 }),
          summary({ sessionId: "b1", projectName: "beta", total: 45 }),
          summary({ sessionId: "b2", projectName: "beta", total: 45 }),
          summary({ sessionId: "b3", projectName: "beta", total: 45 }),
        ])}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("総合スコア中央値"), {
      target: { value: "count" },
    });
    const order = screen
      .getAllByRole("row")
      .slice(1)
      .map((tr) => within(tr).getByRole("link").textContent);
    // 件数昇順: beta(3) → alpha(4)
    expect(order).toEqual(["beta", "alpha"]);
  });

  it("降順トグルで上手い順になる", () => {
    render(<BenchmarkView data={response(twoProjects())} />);
    fireEvent.click(screen.getByLabelText("降順（上手い順）"));
    const order = screen
      .getAllByRole("row")
      .slice(1)
      .map((tr) => within(tr).getByRole("link").textContent);
    expect(order).toEqual(["alpha", "beta"]);
  });

  it("期間フィルタで再集計し、期間外のみのプロジェクトが消える", () => {
    vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
    render(
      <BenchmarkView
        data={response([
          summary({ sessionId: "r1", projectName: "recent", startedAt: "2026-08-24T00:00:00.000Z" }),
          summary({ sessionId: "r2", projectName: "recent", startedAt: "2026-08-23T00:00:00.000Z" }),
          summary({ sessionId: "r3", projectName: "recent", startedAt: "2026-08-22T00:00:00.000Z" }),
          summary({ sessionId: "s1", projectName: "stale", startedAt: "2026-06-01T00:00:00.000Z" }),
        ])}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("すべて"), {
      target: { value: "7d" },
    });
    expect(screen.queryByRole("link", { name: "stale" })).toBeNull();
    expect(screen.getByRole("link", { name: "recent" })).toBeInTheDocument();
  });

  it("プロジェクトリンクは #/?project=<name> で絞り込み遷移する（AC10）", () => {
    render(<BenchmarkView data={response(twoProjects())} />);
    expect(screen.getByRole("link", { name: "alpha" })).toHaveAttribute(
      "href",
      "#/?project=alpha",
    );
  });

  it("最頻の減点をルール名 ×件数で表示する", () => {
    render(
      <BenchmarkView
        data={response([
          summary({ sessionId: "a", projectName: "p", topDeduction: { id: "tool-error-rate", lost: 5 } }),
          summary({ sessionId: "b", projectName: "p", topDeduction: { id: "tool-error-rate", lost: 3 } }),
          summary({ sessionId: "c", projectName: "p", topDeduction: { id: "model-fit", lost: 8 } }),
        ])}
      />,
    );
    expect(screen.getByText("ツールエラー率")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("悪化カテゴリがある行には警告を出す（AC7）", () => {
    render(
      <BenchmarkView
        data={response([
          summary({
            sessionId: "t1", projectName: "p", startedAt: "2026-08-20T00:00:00.000Z",
            categories: { cost: { earned: 18, max: 20 }, productivity: { earned: 5, max: 10 }, practice: { earned: 5, max: 10 } },
          }),
          summary({
            sessionId: "t2", projectName: "p", startedAt: "2026-08-21T00:00:00.000Z",
            categories: { cost: { earned: 18, max: 20 }, productivity: { earned: 5, max: 10 }, practice: { earned: 5, max: 10 } },
          }),
          summary({
            sessionId: "t3", projectName: "p", startedAt: "2026-08-22T00:00:00.000Z",
            categories: { cost: { earned: 4, max: 20 }, productivity: { earned: 5, max: 10 }, practice: { earned: 5, max: 10 } },
          }),
          summary({
            sessionId: "t4", projectName: "p", startedAt: "2026-08-23T00:00:00.000Z",
            categories: { cost: { earned: 4, max: 20 }, productivity: { earned: 5, max: 10 }, practice: { earned: 5, max: 10 } },
          }),
        ])}
      />,
    );
    expect(screen.getByText(/コスト効率が悪化/)).toBeInTheDocument();
  });

  it("箱ひげ SVG に 5 数要約の aria-label が付く", () => {
    render(<BenchmarkView data={response(twoProjects())} />);
    expect(
      screen.getByLabelText(/最小 80 \/ Q1 .* \/ 中央値 85 \/ Q3 .* \/ 最大 90/),
    ).toBeInTheDocument();
  });
});
