/**
 * hash ベースの最小ルーター。
 * - `#/session/<id>` … セッション詳細
 * - `#/benchmark` … プロジェクト横断ベンチマーク
 * - それ以外（`#/` など） … セッション一覧。`?project=<name>` でプロジェクト絞り込みを
 *   URL に載せられる（cinch-016 AC10: 絞り込み state を hash に同期する）。
 * 純粋関数として切り出し、UI を介さずテストできるようにする。
 */
export type Route =
  | { name: "list"; project?: string }
  | { name: "detail"; sessionId: string }
  | { name: "benchmark" };

/** `window.location.hash`（先頭 `#` 有無どちらでも可）を Route に変換する。 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  // クエリ（?project=...）とパスを分離する
  const qIndex = path.indexOf("?");
  const pathPart = qIndex === -1 ? path : path.slice(0, qIndex);
  const queryPart = qIndex === -1 ? "" : path.slice(qIndex + 1);
  const segments = pathPart.split("/").filter((s) => s !== "");

  if (segments.length === 2 && segments[0] === "session") {
    const raw = segments[1] ?? "";
    return { name: "detail", sessionId: safeDecode(raw) };
  }

  if (segments.length === 1 && segments[0] === "benchmark") {
    return { name: "benchmark" };
  }

  const project = readQueryParam(queryPart, "project");
  return project === "" ? { name: "list" } : { name: "list", project };
}

/** Route から hash 文字列（先頭 `#` 付き）を組み立てる。 */
export function routeToHash(route: Route): string {
  if (route.name === "detail") {
    return `#/session/${encodeURIComponent(route.sessionId)}`;
  }
  if (route.name === "benchmark") {
    return "#/benchmark";
  }
  if (route.project !== undefined && route.project !== "") {
    return `#/?project=${encodeURIComponent(route.project)}`;
  }
  return "#/";
}

/** `key=value&...` 形式の断片から key の値を取り出す。無ければ空文字。 */
function readQueryParam(query: string, key: string): string {
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    if (k !== key) continue;
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    return safeDecode(v);
  }
  return "";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // 不正なパーセントエンコーディングはそのまま返す
    return value;
  }
}
