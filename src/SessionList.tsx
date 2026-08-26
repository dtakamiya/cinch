import { useMemo, useState } from "react";
import type { SessionSummary, SessionsResponse } from "../shared/types.js";
import {
  RULE_LABELS,
  formatDateTime,
  formatDuration,
  formatScore,
  scoreBar,
} from "./format.js";

export interface Filters {
  project: string;
  period: string;
  sortBy: "score" | "date";
}

const PERIOD_DAYS: Record<string, number | null> = {
  all: null,
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

/** フィルタと並べ替えを純粋関数として切り出す（UI を介さずテストできるように） */
export function filterAndSort(
  sessions: SessionSummary[],
  filters: Filters,
): SessionSummary[] {
  const days = PERIOD_DAYS[filters.period] ?? null;
  const cutoff = days === null ? null : Date.now() - days * 24 * 60 * 60 * 1000;

  const filtered = sessions.filter((s) => {
    if (filters.project !== "" && s.projectName !== filters.project) return false;
    if (cutoff !== null) {
      const t = Date.parse(s.startedAt);
      if (!Number.isFinite(t) || t < cutoff) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    // 採点対象外は常に末尾へ
    if (a.gradable !== b.gradable) return a.gradable ? -1 : 1;
    if (filters.sortBy === "score" && b.total !== a.total) return b.total - a.total;
    return b.startedAt.localeCompare(a.startedAt);
  });
}

export function SessionList({
  data,
  onSelect,
}: {
  data: SessionsResponse;
  onSelect: (sessionId: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>({
    project: "",
    period: "all",
    sortBy: "score",
  });

  const projects = useMemo(
    () => [...new Set(data.sessions.map((s) => s.projectName))].sort(),
    [data.sessions],
  );

  const rows = useMemo(
    () => filterAndSort(data.sessions, filters),
    [data.sessions, filters],
  );

  const graded = data.sessions.filter((s) => s.gradable);
  const average =
    graded.length === 0
      ? 0
      : graded.reduce((sum, s) => sum + s.total, 0) / graded.length;

  return (
    <div className="list">
      <div className="toolbar">
        <label>
          プロジェクト
          <select
            value={filters.project}
            onChange={(e) => setFilters({ ...filters, project: e.target.value })}
          >
            <option value="">すべて</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          期間
          <select
            value={filters.period}
            onChange={(e) => setFilters({ ...filters, period: e.target.value })}
          >
            <option value="all">すべて</option>
            <option value="1d">24 時間</option>
            <option value="7d">7 日</option>
            <option value="30d">30 日</option>
          </select>
        </label>
        <label>
          並び順
          <select
            value={filters.sortBy}
            onChange={(e) =>
              setFilters({ ...filters, sortBy: e.target.value as Filters["sortBy"] })
            }
          >
            <option value="score">スコア順</option>
            <option value="date">新しい順</option>
          </select>
        </label>
      </div>

      <p className="summary-line">
        平均 {formatScore(Math.round(average * 10) / 10)}点 　 採点済{" "}
        {graded.length}件 / 全{data.sessions.length}件
      </p>

      {data.message !== undefined && <p className="notice">{data.message}</p>}
      {data.skipped.length > 0 && (
        <p className="notice">
          {data.skipped.length} 件のファイルを読み飛ばしました
          {data.skipped[0] !== undefined && `（例: ${data.skipped[0].reason}）`}
        </p>
      )}

      <table className="session-table">
        <thead>
          <tr>
            <th>スコア</th>
            <th>プロジェクト</th>
            <th>開始時刻</th>
            <th>所要</th>
            <th>ターン</th>
            <th>主な減点</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.sessionId}>
              <td className="score-cell">
                {s.gradable ? (
                  <>
                    <span className="bar">{scoreBar(s.total)}</span>{" "}
                    <span className="score">{formatScore(s.total)}</span>
                  </>
                ) : (
                  <span className="ungraded">採点対象外</span>
                )}
              </td>
              <td>
                <button type="button" className="link" onClick={() => onSelect(s.sessionId)}>
                  {s.projectName}
                </button>
              </td>
              <td>{formatDateTime(s.startedAt)}</td>
              <td>{formatDuration(s.durationMs)}</td>
              <td>{s.assistantTurns}</td>
              <td>
                {s.topDeduction === null
                  ? "—"
                  : (RULE_LABELS[s.topDeduction.id] ?? s.topDeduction.id)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
