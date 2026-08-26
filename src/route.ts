/**
 * hash ベースの最小ルーター。`#/session/<id>` なら詳細、それ以外は一覧。
 * 純粋関数として切り出し、UI を介さずテストできるようにする。
 */
export type Route =
  | { name: "list" }
  | { name: "detail"; sessionId: string };

/** `window.location.hash`（先頭 `#` 有無どちらでも可）を Route に変換する。 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  const segments = path.split("/").filter((s) => s !== "");

  if (segments.length === 2 && segments[0] === "session") {
    const raw = segments[1] ?? "";
    return { name: "detail", sessionId: safeDecode(raw) };
  }

  return { name: "list" };
}

/** Route から hash 文字列（先頭 `#` 付き）を組み立てる。 */
export function routeToHash(route: Route): string {
  if (route.name === "detail") {
    return `#/session/${encodeURIComponent(route.sessionId)}`;
  }
  return "#/";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // 不正なパーセントエンコーディングはそのまま返す
    return value;
  }
}
