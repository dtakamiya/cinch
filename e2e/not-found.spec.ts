import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./helpers.js";

/**
 * 存在しない session id（#/session/<不明id>）のフォールバック smoke。
 *
 * App.tsx は詳細 fetch が 404 になると .error バナー＋「一覧に戻る」リンクを出し、
 * 詳細ビュー（.detail-hero / .category-grid / ScoreRing）は描かない契約。
 * 読み込み中スピナー（.notice "読み込み中…"）も残さない。
 *
 * 注意: fetch が 404 を受けると Chromium が「Failed to load resource … 404」を
 * console error に出す（想定内）。React の描画エラーや pageerror が混ざっていない
 * ことだけを確認する。
 */
const FIRST_PAINT_TIMEOUT = 10_000;

test.describe("存在しないセッション (#/session/<不明id>)", () => {
  test("詳細を描画せず 404 メッセージへ穏当にフォールバックする", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/#/session/does-not-exist-xyz", {
      waitUntil: "networkidle",
    });

    await expect(page.locator(".app-header")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    // 404 の見せ方はエラーバナー。文言に「見つかりません」を含む。
    const banner = page.locator(".error, .notice").first();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("見つかりません");

    // 壊れた詳細画面が描かれていない
    await expect(page.locator(".detail-hero")).toHaveCount(0);
    await expect(page.locator(".category-grid")).toHaveCount(0);
    await expect(page.locator(".detail-hero__ring svg")).toHaveCount(0);
    // 読み込み中スピナーが残っていない
    await expect(
      page.locator(".notice", { hasText: "読み込み中" }),
    ).toHaveCount(0);
    // 一覧へ戻る導線がある
    await expect(
      page.locator("a.link", { hasText: "一覧に戻る" }),
    ).toBeVisible();

    // 想定外の console error（404 リソースログ以外）が無いこと
    const unexpected = errors.filter(
      (e) => !/Failed to load resource/i.test(e),
    );
    expect(
      unexpected,
      `想定外の console error:\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });
});
