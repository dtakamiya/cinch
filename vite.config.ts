/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:5174" },
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
  },
});
