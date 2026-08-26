// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreTrend } from "./ScoreTrend.js";
import type { SessionSummary } from "../shared/types.js";

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
      cost: { earned: 25, max: 35 },
      productivity: { earned: 25, max: 35 },
      practice: { earned: 20, max: 30 },
    },
    topDeduction: null,
    ...overrides,
  };
}

describe("ScoreTrend", () => {
  it("採点済みが 2 件未満なら何も描かない", () => {
    const { container } = render(
      <ScoreTrend sessions={[summary()]} projectName="cinch" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("2 件以上あれば SVG と見出しを描く", () => {
    render(
      <ScoreTrend
        sessions={[
          summary({ sessionId: "a", startedAt: "2026-08-20T00:00:00.000Z", total: 60 }),
          summary({ sessionId: "b", startedAt: "2026-08-25T00:00:00.000Z", total: 78 }),
        ]}
        projectName="cinch"
      />,
    );
    expect(screen.getByLabelText("cinch のスコア推移")).toBeInTheDocument();
    expect(screen.getByText("cinch のスコア推移")).toBeInTheDocument();
  });

  it("最初から最後への改善幅を + 付きで表示する", () => {
    render(
      <ScoreTrend
        sessions={[
          summary({ sessionId: "a", startedAt: "2026-08-20T00:00:00.000Z", total: 55 }),
          summary({ sessionId: "b", startedAt: "2026-08-25T00:00:00.000Z", total: 72 }),
        ]}
        projectName="cinch"
      />,
    );
    expect(screen.getByText("+17 点")).toBeInTheDocument();
  });

  it("悪化しているときは負の値を表示する", () => {
    render(
      <ScoreTrend
        sessions={[
          summary({ sessionId: "a", startedAt: "2026-08-20T00:00:00.000Z", total: 80 }),
          summary({ sessionId: "b", startedAt: "2026-08-25T00:00:00.000Z", total: 65 }),
        ]}
        projectName="cinch"
      />,
    );
    expect(screen.getByText("-15 点")).toBeInTheDocument();
  });

  it("採点対象外は推移に含めない（2 件未満扱いになる）", () => {
    const { container } = render(
      <ScoreTrend
        sessions={[
          summary({ sessionId: "a", total: 70 }),
          summary({ sessionId: "b", gradable: false, total: 0 }),
        ]}
        projectName="cinch"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
