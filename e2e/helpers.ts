import type { ConsoleMessage, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * ページのブラウザコンソール error を収集する。
 *
 * cinch-020 の「CSS が丸ごと無効化される」ケースはコンソールに何も出ないので
 * これ単体では検知できないが、React の描画エラーやリソース 404 などの
 * 「本来 0 件であるべきノイズ」を全 smoke で監視する共通ガードとして使う。
 *
 * assertNoConsoleErrors(errors) をテスト末尾で呼ぶこと。
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err: Error) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

export function assertNoConsoleErrors(errors: string[]): void {
  expect(errors, `ブラウザコンソールに error が出ている:\n${errors.join("\n")}`).toEqual([]);
}
