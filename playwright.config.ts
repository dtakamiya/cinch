import { defineConfig, devices } from "@playwright/test";
import {
  EMPTY_API_PORT,
  EMPTY_ROOT,
  EMPTY_WEB_PORT,
  SEED_ROOT,
} from "./e2e/fixtures/seed.js";

/**
 * ブラウザ上の実描画を CI ゲートに載せるための設定。
 *
 * - webServer で `npm run start:e2e`（api + vite）を自動起動する。
 * - api サーバには CINCH_ROOT を渡し、本物の ~/.claude/projects ではなく
 *   e2e/fixtures/seed.ts が用意する採点済みセッションだけを読ませる。
 * - baseURL は E2E 専用ポート。127.0.0.1 に固定（server も 127.0.0.1 バインド）。
 * - CI は chromium 単一（ci.yml が `playwright install --with-deps chromium`）。
 *   e2e ジョブは GitHub Actions ubuntu-latest で走る。ローカルでも同じ挙動。
 * - ビジュアル（toHaveScreenshot）は使わない。OS 別ベースライン（-darwin /
 *   -linux）の維持コストに実利が見合わないため。崩れ検知は smoke の computed
 *   style アサーションで担保する（smoke.spec.ts の冒頭コメント参照）。ダーク
 *   モードの smoke も computed style / CSS 変数の解決値だけを見る（スクショなし）。
 *
 * webServer は 2 つ起動する:
 *  1. 通常 fixture（SEED_ROOT） … 既定 baseURL。ほとんどの spec が使う。
 *  2. 空 fixture（EMPTY_ROOT = 存在しないパス） … empty.spec.ts だけが
 *     test.use({ baseURL: EMPTY_BASE_URL }) で切り替える。「セッションログの
 *     ディレクトリが無い」状態の .notice 表示を検証するため。
 */
// 開発時の既定（5173/5174）を避けて E2E 専用ポートを使う。手元で
// `npm run start` を回したまま E2E を流してもポートが衝突しない。
const PORT = 5273;
const API_PORT = 5274;

export default defineConfig({
  testDir: "./e2e",
  // e2e は *.spec.ts に統一する。vitest 側は *.test.ts（vite.config.ts の
  // test.exclude で e2e/ 自体も弾いている）。testDir に加えてここでも
  // 明示することで、将来 e2e/ にヘルパ *.test.ts を置いても Playwright が
  // それを収集しない（収集ミスの早期検知は ci.yml の `--list` step で担保）。
  testMatch: /\.spec\.ts$/,
  // webServer 起動前に fixture のセッションログを書き出す。
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: process.env["CI"] ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    // viewport はテスト内の要素チェックの前提としてだけ固定する（ビジュアル
    // 比較はしないが、レイアウト依存のアサーションが解像度で揺れないように）。
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run start:e2e",
      url: `http://127.0.0.1:${PORT}`,
      // 手元で E2E 用ポートを塞いでいることは稀なので、CI 以外でも使い回さず
      // 毎回起動する（fixture の CINCH_ROOT を確実に効かせるため）。
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        // server/index.ts が読む API ポート、vite proxy 先、vite の待受ポート。
        PORT: String(API_PORT),
        VITE_API_PORT: String(API_PORT),
        E2E_WEB_PORT: String(PORT),
        CINCH_ROOT: SEED_ROOT,
      },
    },
    {
      // 空 fixture サーバ。CINCH_ROOT に存在しないパスを渡し、rootExists:false を
      // 返させる。empty.spec.ts だけがこの baseURL を使う。
      command: "npm run start:e2e",
      url: `http://127.0.0.1:${EMPTY_WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(EMPTY_API_PORT),
        VITE_API_PORT: String(EMPTY_API_PORT),
        E2E_WEB_PORT: String(EMPTY_WEB_PORT),
        CINCH_ROOT: EMPTY_ROOT,
      },
    },
  ],
});
