import type {
  SessionDetailResponse,
  SessionsResponse,
} from "../shared/types.js";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? "";
    } catch {
      // JSON でない応答は無視して、ステータスだけを伝える
    }
    throw new Error(
      detail !== "" ? detail : `リクエストに失敗しました（${res.status}）`,
    );
  }
  return (await res.json()) as T;
}

export function fetchSessions(): Promise<SessionsResponse> {
  return getJson<SessionsResponse>("/api/sessions");
}

export function fetchSessionDetail(
  sessionId: string,
): Promise<SessionDetailResponse> {
  return getJson<SessionDetailResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  );
}
