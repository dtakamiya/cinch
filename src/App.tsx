import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionDetailResponse, SessionsResponse } from "../shared/types.js";
import { fetchSessionDetail, fetchSessions } from "./api.js";
import { IconLogo, IconRefresh } from "./icons.js";
import { parseRoute, type Route } from "./route.js";
import { SessionDetail } from "./SessionDetail.js";
import { SessionList } from "./SessionList.js";

function currentRoute(): Route {
  return parseRoute(window.location.hash);
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [list, setList] = useState<SessionsResponse | null>(null);
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // 詳細 route から離れたことを検知するための直前 route 名。詳細 fetch が
  // 残した loading / error（in-flight の中断や 404 バナー）を list に
  // 持ち越さないよう、離脱時に後始末する。
  const prevRouteName = useRef<Route["name"] | null>(null);

  // hash の変化に追従する（初回は hashchange が発火しないため初期値で state を持つ）
  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setList(await fetchSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // 一覧が必要になった時点で（未取得なら）取得する。再スキャンは常に取り直す。
  const rescan = useCallback(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (route.name === "list" && list === null) {
      void loadList();
    }
  }, [route.name, list, loadList]);

  // 詳細 route のときは対象 sessionId の詳細を取得する
  useEffect(() => {
    if (route.name !== "detail") {
      setDetail(null);
      // 詳細 route から離れたときだけ、詳細 fetch が残した loading / error
      // （in-flight 中断で .finally が setLoading(false) を呼ばないケース、
      // および 404 バナー）を片付ける。初回マウントの list 取得中に誤って
      // loading を折らないよう、直前が detail だった場合に限定する。
      if (prevRouteName.current === "detail") {
        setLoading(false);
        setError(null);
      }
      prevRouteName.current = route.name;
      return;
    }
    prevRouteName.current = "detail";
    const sessionId = route.sessionId;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    fetchSessionDetail(sessionId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route]);

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
        <button type="button" className="link" onClick={rescan}>
          <IconRefresh />
          再スキャン
        </button>
      </header>

      {error !== null && (
        <>
          <p className="error">{error}</p>
          {route.name === "detail" && (
            <p>
              <a className="link" href="#/">
                一覧に戻る
              </a>
            </p>
          )}
        </>
      )}
      {loading && <p className="notice">読み込み中…</p>}

      {route.name === "detail"
        ? detail !== null && <SessionDetail data={detail} />
        : list !== null && <SessionList data={list} />}
    </div>
  );
}
