import { expect, test } from "@playwright/test";
import {
  assertNoConsoleErrors,
  collectConsoleErrors,
  computedStyle,
} from "./helpers.js";
import { TREND_PROJECT_NAME } from "./fixtures/seed.js";

/**
 * スコア推移（ScoreTrend）・カテゴリ別 獲得率推移（CategoryScoreTrends）の描画 smoke。
 *
 * これらは「プロジェクトを 1 つ選んでいて」「採点済み 2 件以上」かつ
 * （カテゴリ別は）「週が 2 つ以上」のときだけ出る。fixture の trend-proj は
 * 3 週 4 セッションで、両方が描画される条件を満たす（e2e/fixtures/seed.ts）。
 *
 * cinch-020 型の「CSS ブロックが丸ごと死ぬ」事故は typecheck / test / build を
 * 素通りするので、SVG の存在だけでなく .trend / .cat-trend の computed style も見る。
 * ここで比較している値は src/styles.css の現在値。styles.css を変えたら追従すること。
 */
const FIRST_PAINT_TIMEOUT = 10_000;
const TREND_HASH = `/#/?project=${TREND_PROJECT_NAME}`;

test.describe("スコア推移 (#/?project=trend-proj)", () => {
  test("折れ線 SVG が描かれ、.trend の CSS ブロックが効いている", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(TREND_HASH, { waitUntil: "networkidle" });

    const trend = page.locator(".trend");
    await expect(trend).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    // 生スコア path + 移動平均 path の 2 本。いずれも d は "M ... L ..."（2 点以上）。
    const paths = page.locator(".trend__svg path");
    await expect(paths).toHaveCount(2);
    const ds = await paths.evaluateAll((els) =>
      els.map((e) => e.getAttribute("d") ?? ""),
    );
    for (const d of ds) expect(d).toMatch(/^M [\d.]+ [\d.]+ L /);

    // セッション点は採点済み 4 件ぶん
    await expect(page.locator(".trend__svg circle")).toHaveCount(4);

    // --- cinch-020 型の CSS 事故検知 ---
    // .trend__svg { height: 180px } が消えると SVG は height:auto に落ちる。
    expect(await computedStyle(page.locator(".trend__svg"), "height")).toBe(
      "180px",
    );
    // .trend { background: var(--panel); border-radius: var(--radius) }
    const bg = await computedStyle(trend, "background-color");
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg).not.toBe("transparent");
    expect(await computedStyle(trend, "border-top-left-radius")).toBe("12px");

    // デルタバッジは方向クラス（up/down/flat）を data 属性で持つ
    await expect(page.locator(".trend__delta")).toHaveAttribute(
      "data-direction",
      /^(up|down|flat)$/,
    );

    assertNoConsoleErrors(errors);
  });

  test("カテゴリ別スパークライン 3 枚が描かれ、grid レイアウトが効いている", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(TREND_HASH, { waitUntil: "networkidle" });

    const catTrend = page.locator(".cat-trend");
    await expect(catTrend).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });

    // cost / productivity / practice の 3 枚。各 1 本の折れ線 path。
    await expect(page.locator(".cat-spark")).toHaveCount(3);
    const sparkPaths = page.locator(".cat-spark__svg path");
    await expect(sparkPaths).toHaveCount(3);
    const ds = await sparkPaths.evaluateAll((els) =>
      els.map((e) => e.getAttribute("d") ?? ""),
    );
    for (const d of ds) expect(d).toMatch(/^M [\d.]+ [\d.]+ L /);

    // --- CSS 事故検知 ---
    // .cat-trend__grid { display: grid; grid-template-columns: repeat(3, 1fr) }
    const grid = page.locator(".cat-trend__grid");
    expect(await computedStyle(grid, "display")).toBe("grid");
    const cols = (await computedStyle(grid, "grid-template-columns"))
      .split(/\s+/)
      .filter(Boolean);
    expect(cols).toHaveLength(3);
    // .cat-spark__svg { height: 64px }
    expect(
      await computedStyle(page.locator(".cat-spark__svg").first(), "height"),
    ).toBe("64px");

    assertNoConsoleErrors(errors);
  });

  test("プロジェクト未選択（#/）では推移セクションを出さない", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/#/", { waitUntil: "networkidle" });
    await expect(page.locator(".session-list")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    await expect(page.locator(".trend")).toHaveCount(0);
    await expect(page.locator(".cat-trend")).toHaveCount(0);

    assertNoConsoleErrors(errors);
  });
});
