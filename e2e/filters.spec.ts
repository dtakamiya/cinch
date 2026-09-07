import { expect, test } from "@playwright/test";
import { assertNoConsoleErrors, collectConsoleErrors } from "./helpers.js";
import { TREND_PROJECT_NAME } from "./fixtures/seed.js";

/**
 * フィルタバー（.filter-pill ×4）の操作 smoke。
 *
 * - プロジェクト絞り込みは URL(hash) に同期する契約（cinch-016 AC10）。
 *   `#/?project=<name>` と .session-card 件数が連動することを実ブラウザで回帰確認する。
 * - 期間 / 並び順 / 採点対象外は hash には出ないが、一覧の件数・並びに効く。
 *
 * jsdom の SessionList.test.tsx は filterAndSort を純粋関数として検証しているが、
 * 「<select> の change → state → 再描画 → hashchange」までの結線は実ブラウザでしか通らない。
 */
const FIRST_PAINT_TIMEOUT = 10_000;

test.describe("フィルタバー (#/)", () => {
  test("プロジェクト絞り込みが .session-card 件数と URL hash に連動する (cinch-016 回帰)", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/#/", { waitUntil: "networkidle" });

    const cards = page.locator(".session-card");
    // 採点済み: proj-a / b / c（各 1）＋ trend-proj（4）＝ 7。既定は採点対象外オフ。
    await expect(cards).toHaveCount(7, { timeout: FIRST_PAINT_TIMEOUT });
    await expect(page.locator(".filter-bar .filter-pill")).toHaveCount(4);

    // 第 1 pill（プロジェクト）で trend-proj に絞る
    const projectSelect = page.locator(".filter-pill").nth(0).locator("select");
    await projectSelect.selectOption(TREND_PROJECT_NAME);

    await expect(cards).toHaveCount(4);
    await expect
      .poll(() => new URL(page.url()).hash)
      .toBe(`#/?project=${TREND_PROJECT_NAME}`);

    // 「すべて」に戻すと全 7 枚・hash も戻る
    await projectSelect.selectOption("");
    await expect(cards).toHaveCount(7);
    await expect.poll(() => new URL(page.url()).hash).toBe("#/");

    assertNoConsoleErrors(errors);
  });

  test("期間・並び順・採点対象外の各 pill が一覧の件数に効く", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/#/", { waitUntil: "networkidle" });

    const cards = page.locator(".session-card");
    await expect(cards).toHaveCount(7, { timeout: FIRST_PAINT_TIMEOUT });

    // 第 3 pill（並び順）: スコア順に変えても件数は不変（並びだけ変わる）
    await page
      .locator(".filter-pill")
      .nth(2)
      .locator("select")
      .selectOption("score");
    await expect(cards).toHaveCount(7);

    // 第 4 pill（採点対象外を表示）: gradable:false の 1 枚が増える
    await page
      .locator(".filter-pill")
      .nth(3)
      .locator("input[type=checkbox]")
      .check();
    await expect(cards).toHaveCount(8);
    await expect(page.locator(".session-card--ungraded")).toHaveCount(1);

    // 第 2 pill（期間）: 24 時間に絞ると fixture は全て過去日なので 0 枚
    await page
      .locator(".filter-pill")
      .nth(1)
      .locator("select")
      .selectOption("1d");
    await expect(cards).toHaveCount(0);

    // hash は project 以外では書き換わらない（cinch-016 の契約）
    expect(new URL(page.url()).hash).toBe("#/");

    assertNoConsoleErrors(errors);
  });
});
