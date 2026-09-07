import type { ConsoleMessage, Locator, Page } from "@playwright/test";
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

/**
 * 要素の getComputedStyle から 1 プロパティを読む。
 * cinch-020 型の「CSS ブロックが丸ごと死ぬ」事故は、対応するルールが効かなくなり
 * 初期値（display:inline / height:auto など）へ落ちるので、期待値との比較で捕まる。
 */
export function computedStyle(locator: Locator, prop: string): Promise<string> {
  return locator.evaluate(
    (el, p) => getComputedStyle(el as Element).getPropertyValue(p),
    prop,
  );
}

/**
 * :root で解決された CSS カスタムプロパティの値（オーサリング時の文字列）を読む。
 * ダークモード smoke で `prefers-color-scheme` の分岐が効いているかを、
 * OS 非依存・スクリーンショット非依存で確かめるのに使う。
 */
export function rootCssVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}
