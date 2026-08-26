// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ScoreRing } from "./ScoreRing.js";

/** 前景円（stroke-linecap="round" が付いている方）を取り出す */
function foregroundCircle(container: HTMLElement): SVGCircleElement {
  const circles = [...container.querySelectorAll("circle")];
  const fg = circles.find((c) => c.getAttribute("stroke-linecap") === "round");
  if (!fg) throw new Error("前景円が見つかりません");
  return fg as SVGCircleElement;
}

describe("ScoreRing", () => {
  it("スコアの数値を表示する", () => {
    const { getByText } = render(<ScoreRing total={72} />);
    expect(getByText("72")).toBeInTheDocument();
  });

  it("total=0 は弧長 0（全周が gap）", () => {
    const { container } = render(<ScoreRing total={0} size={64} />);
    const dash = foregroundCircle(container).getAttribute("stroke-dasharray") ?? "";
    const [on] = dash.split(" ").map(Number);
    expect(on).toBeCloseTo(0, 1);
  });

  it("total=100 は弧長が円周と一致する", () => {
    const size = 64;
    const stroke = 5;
    const r = (size - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const { container } = render(<ScoreRing total={100} size={size} />);
    const dash = foregroundCircle(container).getAttribute("stroke-dasharray") ?? "";
    const [on] = dash.split(" ").map(Number);
    expect(on).toBeCloseTo(circumference, 0);
  });

  it("total=50 は円周の半分", () => {
    const size = 64;
    const stroke = 5;
    const r = (size - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const { container } = render(<ScoreRing total={50} size={size} />);
    const dash = foregroundCircle(container).getAttribute("stroke-dasharray") ?? "";
    const [on] = dash.split(" ").map(Number);
    expect(on).toBeCloseTo(circumference / 2, 0);
  });

  it("スコアに応じて前景色が変わる", () => {
    const good = render(<ScoreRing total={90} />);
    expect(foregroundCircle(good.container).getAttribute("stroke")).toBe("var(--good)");

    const warn = render(<ScoreRing total={70} />);
    expect(foregroundCircle(warn.container).getAttribute("stroke")).toBe("var(--warn)");

    const bad = render(<ScoreRing total={40} />);
    expect(foregroundCircle(bad.container).getAttribute("stroke")).toBe("var(--bad)");
  });
});
