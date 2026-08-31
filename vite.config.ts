/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API のポートは server/index.ts と揃える（既定 5174）。E2E は衝突回避のため
// VITE_API_PORT / PORT を渡して別ポートに逃がせるようにしておく。
const API_PORT = process.env["VITE_API_PORT"] ?? process.env["PORT"] ?? "5174";

export default defineConfig({
  plugins: [react()],
  server: {
    // ポート衝突時に別ポートへ黙って退避せず、起動を失敗させる。
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${API_PORT}` },
  },
  test: {
    // デフォルトを node にしているのは、サーバ側テストの方が数が多く、
    // jsdom の起動が無駄なため。src/ 配下のテストが増えたら
    // vitest の projects（ワークスペース）機能で jsdom を割り当てる。
    // vitest 4 では environmentMatchGlobs が削除されているため、
    // src/ 用テストファイルは個別に `// @vitest-environment jsdom`
    // ディレクティブを先頭に書いて環境を指定する。
    environment: "node",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    // e2e/ は Playwright（`npm run test:e2e`）の担当。vitest からは除外する。
    // vitest の既定 exclude を残しつつ e2e/ を足す。
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "e2e/**",
    ],
  },
});
