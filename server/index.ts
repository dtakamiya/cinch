import { createApp } from "./api.js";
import { handleListenError } from "./listenError.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env["PORT"] ?? 5174);

// セッションログには会話内容が含まれるため、必ずローカルホストのみにバインドする。
// 第 2 引数の HOST を省略したり 0.0.0.0 にしたりしないこと。
createApp()
  .listen(PORT, HOST, () => {
    console.log(`cinch API: http://${HOST}:${PORT}`);
  })
  .on("error", (err: NodeJS.ErrnoException) => handleListenError(err, PORT));
