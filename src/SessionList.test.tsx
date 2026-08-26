// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SessionList, filterAndSort, summarize } from "./SessionList.js";
import type { SessionSummary, SessionsResponse } from "../shared/types.js";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "s1",
    projectName: "cinch",
    cwd: "/Users/x/work/cinch",
    startedAt: "2026-08-25T14:03:00.000Z",
    durationMs: 1_800_000,
    assistantTurns: 38,
    total: 71,
    gradable: true,
    categories: {
      cost: { earned: 25, max: 35 },
      productivity: { earned: 26, max: 35 },
      practice: { earned: 20, max: 30 },
    },
    topDeduction: { id: "tool-error-rate", lost: 9 },
    ...overrides,
  };
}

function response(sessions: SessionSummary[]): SessionsResponse {
  return {
    sessions,
    scannedAt: "2026-08-25T15:00:00.000Z",
    projectCount: 1,
    skipped: [],
  };
}

describe("filterAndSort", () => {
  const sessions = [
    summary({ sessionId: "a", projectName: "cinch", total: 42, startedAt: "2026-08-24T00:00:00.000Z" }),
    summary({ sessionId: "b", projectName: "other", total: 89, startedAt: "2026-08-22T00:00:00.000Z" }),
    summary({ sessionId: "c", projectName: "cinch", total: 71, startedAt: "2026-08-23T00:00:00.000Z" }),
  ];

  it("スコアの高い順に並べる", () => {
    const out = filterAndSort(sessions, { project: "", period: "all", sortBy: "score", showUngraded: true });
    expect(out.map((s) => s.sessionId)).toEqual(["b", "c", "a"]);
  });

  it("日付の新しい順に並べる", () => {
    const out = filterAndSort(sessions, { project: "", period: "all", sortBy: "date", showUngraded: true });
    expect(out.map((s) => s.sessionId)).toEqual(["a", "c", "b"]);
  });

  it("プロジェクトで絞り込む", () => {
    const out = filterAndSort(sessions, { project: "cinch", period: "all", sortBy: "score", showUngraded: true });
    expect(out.map((s) => s.sessionId)).toEqual(["c", "a"]);
  });

  it("採点対象外のセッションを末尾に置く", () => {
    const withUngraded = [
      ...sessions,
      summary({ sessionId: "d", total: 0, gradable: false, topDeduction: null }),
    ];
    const out = filterAndSort(withUngraded, { project: "", period: "all", sortBy: "score", showUngraded: true });
    expect(out[out.length - 1]?.sessionId).toBe("d");
  });

  it("showUngraded が false なら採点対象外を除外する", () => {
    const withUngraded = [
      ...sessions,
      summary({ sessionId: "d", total: 0, gradable: false, topDeduction: null }),
    ];
    const out = filterAndSort(withUngraded, { project: "", period: "all", sortBy: "score", showUngraded: false });
    expect(out.map((s) => s.sessionId)).toEqual(["b", "c", "a"]);
  });

  it("showUngraded が true なら採点対象外を末尾に含める", () => {
    const withUngraded = [
      ...sessions,
      summary({ sessionId: "d", total: 0, gradable: false, topDeduction: null }),
    ];
    const out = filterAndSort(withUngraded, { project: "", period: "all", sortBy: "score", showUngraded: true });
    expect(out.map((s) => s.sessionId)).toEqual(["b", "c", "a", "d"]);
  });

  it("showUngraded が false でも gradable のみの配列は変化しない", () => {
    const out = filterAndSort(sessions, { project: "", period: "all", sortBy: "score", showUngraded: false });
    expect(out.map((s) => s.sessionId)).toEqual(["b", "c", "a"]);
  });

  it("期間フィルタで範囲外を除く", () => {
    const now = new Date("2026-08-25T00:00:00.000Z");
    vi.setSystemTime(now);
    const out = filterAndSort(sessions, { project: "", period: "7d", sortBy: "score", showUngraded: true });
    expect(out).toHaveLength(3);

    const narrow = filterAndSort(sessions, { project: "", period: "1d", sortBy: "score", showUngraded: true });
    expect(narrow.map((s) => s.sessionId)).toEqual(["a"]);
    vi.useRealTimers();
  });

  it("元の配列を変更しない", () => {
    const original = [...sessions];
    filterAndSort(sessions, { project: "", period: "all", sortBy: "score", showUngraded: true });
    expect(sessions).toEqual(original);
  });
});

describe("summarize", () => {
  it("空配列は NaN を出さず avg:0 を返す", () => {
    expect(summarize([])).toEqual({ avg: 0, graded: 0, total: 0 });
  });

  it("gradable のみ複数なら平均を計算する", () => {
    const out = summarize([
      summary({ sessionId: "a", total: 60 }),
      summary({ sessionId: "b", total: 80 }),
      summary({ sessionId: "c", total: 100 }),
    ]);
    expect(out).toEqual({ avg: 80, graded: 3, total: 3 });
  });

  it("gradable と ungraded が混在しても gradable だけで平均を出す", () => {
    const out = summarize([
      summary({ sessionId: "a", total: 60 }),
      summary({ sessionId: "b", total: 80 }),
      summary({ sessionId: "c", gradable: false, total: 0 }),
    ]);
    expect(out).toEqual({ avg: 70, graded: 2, total: 3 });
  });

  it("ungraded のみなら avg:0 graded:0 total:N", () => {
    const out = summarize([
      summary({ sessionId: "a", gradable: false, total: 0 }),
      summary({ sessionId: "b", gradable: false, total: 0 }),
    ]);
    expect(out).toEqual({ avg: 0, graded: 0, total: 2 });
  });
});

describe("SessionList", () => {
  it("セッションを行として表示する", () => {
    render(<SessionList data={response([summary()])} />);
    // カード全体がリンク。アクセシブルネームにプロジェクト名を含む。
    const card = screen.getByRole("link", { name: /cinch/ });
    expect(card).toBeInTheDocument();
    expect(within(card).getByText("71")).toBeInTheDocument();
    expect(within(card).getByText("38 ターン")).toBeInTheDocument();
  });

  it("主な減点をルールの日本語名で表示する", () => {
    render(<SessionList data={response([summary()])} />);
    expect(screen.getByText("ツールエラー率")).toBeInTheDocument();
  });

  it("主な減点タグに失点を −N 形式で併記する", () => {
    render(<SessionList data={response([summary()])} />);
    // summary() の topDeduction.lost は 9
    expect(screen.getByText("−9")).toBeInTheDocument();
  });

  it("最終スキャン時刻を表示する", () => {
    render(<SessionList data={response([summary()])} />);
    // response() の scannedAt は 2026-08-25T15:00:00Z
    expect(screen.getByText(/最終スキャン/)).toBeInTheDocument();
  });

  it("scannedAt が空文字なら最終スキャン表示を出さない", () => {
    render(
      <SessionList data={{ ...response([summary()]), scannedAt: "" }} />,
    );
    expect(screen.queryByText(/最終スキャン/)).not.toBeInTheDocument();
  });

  it("減点が無いセッションは — を表示する", () => {
    render(
      <SessionList
        data={response([summary({ total: 100, topDeduction: null })])}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("平均点と採点済み件数を表示する（採点対象外を表示したとき全件に含める）", () => {
    render(
      <SessionList
        data={response([
          summary({ sessionId: "a", total: 60 }),
          summary({ sessionId: "b", total: 80 }),
          summary({ sessionId: "c", gradable: false, total: 0 }),
        ])}
      />,
    );
    // デフォルトは採点対象外を除外するので全2件
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.getByText(/件 \/ 全2件/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("採点対象外を表示"));
    expect(screen.getByText(/件 \/ 全3件/)).toBeInTheDocument();
  });

  it("採点済みカードは詳細への hash リンクになる", () => {
    render(<SessionList data={response([summary({ sessionId: "a/b c" })])} />);
    const card = screen.getByRole("link", { name: /cinch/ });
    expect(card).toHaveAttribute("href", "#/session/a%2Fb%20c");
  });

  it("採点対象外はデフォルトで表示せず、トグルで表示できる", () => {
    render(
      <SessionList
        data={response([summary({ gradable: false, total: 0, topDeduction: null })])}
      />,
    );
    expect(screen.queryByText("採点対象外")).toBeNull();

    fireEvent.click(screen.getByLabelText("採点対象外を表示"));
    expect(screen.getByText("採点対象外")).toBeInTheDocument();
  });

  it("採点対象外のセッションはリンクにしない", () => {
    render(
      <SessionList
        data={response([summary({ gradable: false, total: 0, topDeduction: null })])}
      />,
    );
    fireEvent.click(screen.getByLabelText("採点対象外を表示"));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("skipped があれば件数を表示する", () => {
    const data = response([summary()]);
    data.skipped = [
      { path: "/a.jsonl", reason: "ファイルが空です" },
      { path: "/b.jsonl", reason: "読めません" },
    ];
    render(<SessionList data={data} />);
    expect(screen.getByText(/2 件のファイルを読み飛ばしました/)).toBeInTheDocument();
  });

  it("message があれば表示する（ログが 1 件も無い場合）", () => {
    const data = response([]);
    data.message = "セッションログのディレクトリが見つかりません。";
    render(<SessionList data={data} />);
    expect(screen.getByText(/見つかりません/)).toBeInTheDocument();
  });
});
