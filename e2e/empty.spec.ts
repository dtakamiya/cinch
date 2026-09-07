import { expect, test } from "@playwright/test";
import { assertNoConsoleErrors, collectConsoleErrors } from "./helpers.js";
import { EMPTY_BASE_URL } from "./fixtures/seed.js";

/**
 * 空データ（CINCH_ROOT が存在しない）状態の smoke。
 *
 * playwright.config.ts の 2 つ目の webServer が CINCH_ROOT に存在しないパスを渡して
 * いる。server は rootExists:false を返し、
 *  - 一覧: SessionsResponse.message（NO_ROOT メッセージ）→ SessionList が .notice 表示
 *  - ベンチマーク: 採点済み 0 → BenchmarkView が「…ありません」の .notice 表示
 * となる。このファイルだけ baseURL を空 fixture サーバに向ける。
 */
const FIRST_PAINT_TIMEOUT = 10_000;

test.use({ baseURL: EMPTY_BASE_URL });

test.describe("空データ (CINCH_ROOT なし)", () => {
  test("一覧は NO_ROOT メッセージの .notice を出し、カードは 0 枚", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/#/", { waitUntil: "networkidle" });

    await expect(page.locator(".app-header")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    const notice = page.locator(".notice", {
      hasText: "セッションログのディレクトリが見つかりません",
    });
    await expect(notice).toBeVisible();
    await expect(page.locator(".session-card")).toHaveCount(0);
    // 読み込み中スピナーが残っていない
    await expect(
      page.locator(".notice", { hasText: "読み込み中" }),
    ).toHaveCount(0);
    // クラッシュしていない（エラーバナーも出ていない）
    await expect(page.locator(".error")).toHaveCount(0);

    assertNoConsoleErrors(errors);
  });

  test("ベンチマークは「採点済みなし」の .notice を出し、テーブルは描かれない", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/#/benchmark", { waitUntil: "networkidle" });

    const notice = page.locator(".benchmark .notice");
    await expect(notice).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(notice).toContainText(
      "採点済みセッションのあるプロジェクトはありません",
    );
    await expect(page.locator(".benchmark__table")).toHaveCount(0);

    assertNoConsoleErrors(errors);
  });
});
