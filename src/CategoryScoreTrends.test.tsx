// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryScoreTrends } from "./CategoryScoreTrends.js";
import type { SessionSummary } from "../shared/types.js";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: "s1",
    projectName: "cinch",
    cwd: "/x/cinch",
    startedAt: "2026-08-24T10:00:00.000Z",
    durationMs: 1000,
    assistantTurns: 10,
    total: 70,
    gradable: true,
    categories: {
      cost: { earned: 20, max: 35 },
      productivity: { earned: 25, max: 35 },
      practice: { earned: 15, max: 30 },
    },
    topDeduction: null,
    ...overrides,
  };
}

describe("CategoryScoreTrends", () => {
  it("採点済みが 2 件未満なら何も描かない", () => {
    const { container } = render(
      <CategoryScoreTrends sessions={[summary()]} projectName="cinch" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("週が 1 つしか無い（同一週 2 件）なら何も描かない", () => {
    const { container } = render(
      <CategoryScoreTrends
        sessions={[
          summary({ sessionId: "a", startedAt: "2026-08-24T09:00:00.000Z" }),
          summary({ sessionId: "b", startedAt: "2026-08-26T09:00:00.000Z" }),
        ]}
        projectName="cinch"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("2 週以上あれば 3 カテゴリのスパークラインを描く", () => {
    render(
      <CategoryScoreTrends
        sessions={[
          summary({ sessionId: "a", startedAt: "2026-08-24T09:00:00.000Z" }),
          summary({ sessionId: "b", startedAt: "2026-08-31T09:00:00.000Z" }),
        ]}
        projectName="cinch"
      />,
    );
    expect(
      screen.getByLabelText("cinch のカテゴリ別スコア推移"),
    ).toBeInTheDocument();
    expect(screen.getByText("コスト効率")).toBeInTheDocument();
    expect(screen.getByText("生産性")).toBeInTheDocument();
    expect(screen.getByText("ベストプラクティス")).toBeInTheDocument();
  });

  it("先週比が改善なら上昇アイコン、悪化なら下降アイコンを出す", () => {
    render(
      <CategoryScoreTrends
        sessions={[
          summary({
            sessionId: "a",
            startedAt: "2026-08-24T09:00:00.000Z",
            categories: {
              cost: { earned: 5, max: 10 }, // 0.5
              productivity: { earned: 5, max: 10 }, // 0.5
              practice: { earned: 5, max: 10 }, // 0.5
            },
          }),
          summary({
            sessionId: "b",
            startedAt: "2026-08-31T09:00:00.000Z",
            categories: {
              cost: { earned: 9, max: 10 }, // 0.9 → +40pt
              productivity: { earned: 1, max: 10 }, // 0.1 → -40pt
              practice: { earned: 5, max: 10 }, // 0.5 → 0
            },
          }),
        ]}
        projectName="cinch"
      />,
    );
    expect(screen.getByText("+40pt")).toBeInTheDocument();
    expect(screen.getByText("-40pt")).toBeInTheDocument();
    expect(screen.getByLabelText("上昇")).toBeInTheDocument();
    expect(screen.getByLabelText("下降")).toBeInTheDocument();
  });

  it("gradable:false は 2 件のカウントに入れない（描画されない）", () => {
    const { container } = render(
      <CategoryScoreTrends
        sessions={[
          summary({ sessionId: "a", startedAt: "2026-08-24T09:00:00.000Z" }),
          summary({
            sessionId: "b",
            startedAt: "2026-08-31T09:00:00.000Z",
            gradable: false,
            total: 0,
            categories: {
              cost: { earned: 0, max: 0 },
              productivity: { earned: 0, max: 0 },
              practice: { earned: 0, max: 0 },
            },
          }),
        ]}
        projectName="cinch"
      />,
    );
    // 採点済みは 1 件だけ → ガードで null
    expect(container.firstChild).toBeNull();
  });
});
