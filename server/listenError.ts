/**
 * listen が失敗したときのハンドラ。ポートが使用中（EADDRINUSE）なら
 * 原因を明示して即座に異常終了する。concurrently の
 * --kill-others-on-fail と組み合わせて、片方が落ちたら全体を止める。
 *
 * 副作用のあるブートストラップ（index.ts の listen）から切り離して
 * おくことで、この分岐だけを単体テストできるようにしている。
 */
export function handleListenError(err: NodeJS.ErrnoException, port: number): never {
  if (err.code === "EADDRINUSE") {
    console.error(
      `ポート ${port} は使用中です。既存の cinch が起動していないか確認してください。`,
    );
    process.exit(1);
  }
  throw err;
}
