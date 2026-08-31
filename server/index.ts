import { createApp } from "./api.js";
import { handleListenError } from "./listenError.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env["PORT"] ?? 5174);
// E2E / 開発時にセッションログの探索ルートを差し替えるための環境変数。
// 未設定なら従来どおり ~/.claude/projects を見る（api.ts の defaultRoot）。
// API 表面（エンドポイント・レスポンス形状）には影響しない、起動時の設定注入のみ。
const ROOT = process.env["CINCH_ROOT"];

// セッションログには会話内容が含まれるため、必ずローカルホストのみにバインドする。
// 第 2 引数の HOST を省略したり 0.0.0.0 にしたりしないこと。
createApp(ROOT ? { root: ROOT } : {})
  .listen(PORT, HOST, () => {
    console.log(`cinch API: http://${HOST}:${PORT}`);
  })
  .on("error", (err: NodeJS.ErrnoException) => handleListenError(err, PORT));
