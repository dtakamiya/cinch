import { expect, test } from "@playwright/test";
import {
  assertNoConsoleErrors,
  collectConsoleErrors,
  computedStyle,
  rootCssVar,
} from "./helpers.js";

/**
 * ダークモード（prefers-color-scheme）の分岐 smoke。
 *
 * src/styles.css は「ダークが :root の基本値」「ライトは
 * @media (prefers-color-scheme: light) で上書き」という構造。
 * Playwright の colorScheme を切り替えて、
 *  - dark : 基本値（暗色）がそのまま解決される
 *  - light: @media 分岐が明色へ上書きする
 * ことを CSS 変数の解決値 ＋ computed style で確かめる。
 *
 * スクリーンショットのベースライン（-darwin / -linux）は作らない。ここは
 * OS 非依存に保つ（値だけを見る）。比較値は src/styles.css の現在値。
 */
const FIRST_PAINT_TIMEOUT = 10_000;

// styles.css の現在値（:root と @media light）。
const DARK = { bg: "oklch(0.16 0.012 265)", fg: "oklch(0.96 0.005 265)" };
const LIGHT = { bg: "oklch(0.985 0.003 265)", fg: "oklch(0.22 0.014 265)" };

const norm = (v: string) => v.replace(/\s+/g, " ").trim();

test.describe("ダークモード (prefers-color-scheme)", () => {
  test.describe("colorScheme: dark", () => {
    test.use({ colorScheme: "dark" });

    test("基本値（ダーク）の CSS 変数が解決され、body 背景が塗られている", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await page.goto("/#/", { waitUntil: "networkidle" });
      await expect(page.locator(".app-header")).toBeVisible({
        timeout: FIRST_PAINT_TIMEOUT,
      });

      expect(norm(await rootCssVar(page, "--bg"))).toBe(DARK.bg);
      expect(norm(await rootCssVar(page, "--fg"))).toBe(DARK.fg);

      // 実描画にも効いている（body 背景が透明でない）
      const bodyBg = await computedStyle(page.locator("body"), "background-color");
      expect(bodyBg).not.toBe("rgba(0, 0, 0, 0)");
      expect(bodyBg).not.toBe("transparent");

      assertNoConsoleErrors(errors);
    });
  });

  test.describe("colorScheme: light", () => {
    test.use({ colorScheme: "light" });

    test("@media (prefers-color-scheme: light) 分岐が変数を明色へ上書きする", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await page.goto("/#/", { waitUntil: "networkidle" });
      await expect(page.locator(".app-header")).toBeVisible({
        timeout: FIRST_PAINT_TIMEOUT,
      });

      expect(norm(await rootCssVar(page, "--bg"))).toBe(LIGHT.bg);
      expect(norm(await rootCssVar(page, "--fg"))).toBe(LIGHT.fg);

      assertNoConsoleErrors(errors);
    });
  });
});
