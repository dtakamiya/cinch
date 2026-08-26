import { useCallback, useEffect, useState } from "react";
import type { SessionDetailResponse, SessionsResponse } from "../shared/types.js";
import { fetchSessionDetail, fetchSessions } from "./api.js";
import { IconLogo, IconRefresh } from "./icons.js";
import { SessionDetail } from "./SessionDetail.js";
import { SessionList } from "./SessionList.js";

export function App() {
  const [list, setList] = useState<SessionsResponse | null>(null);
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setList(await fetchSessions());
      setDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchSessionDetail(sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo">
            <IconLogo size={20} />
          </span>
          <div>
            <h1>cinch</h1>
            <div className="app-brand__sub">Claude Code セッション採点</div>
          </div>
        </div>
        <button type="button" className="link" onClick={() => void loadList()}>
          <IconRefresh />
          再スキャン
        </button>
      </header>

      {error !== null && <p className="error">{error}</p>}
      {loading && <p className="notice">読み込み中…</p>}

      {detail !== null ? (
        <SessionDetail data={detail} onBack={() => setDetail(null)} />
      ) : (
        list !== null && <SessionList data={list} onSelect={(id) => void openDetail(id)} />
      )}
    </div>
  );
}
