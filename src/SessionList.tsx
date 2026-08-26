import { useMemo, useState } from "react";
import type { SessionSummary, SessionsResponse } from "../shared/types.js";
import { ScoreRing } from "./ScoreRing.js";
import {
  IconActivity,
  IconArrowRight,
  IconChevronRight,
  IconClock,
  IconMinus,
} from "./icons.js";
import {
  RULE_LABELS,
  formatDateTime,
  formatDuration,
  formatScore,
  scoreColor,
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

export function SessionList({ data }: { data: SessionsResponse }) {
  const [filters, setFilters] = useState<Filters>({
    project: "",
    period: "all",
    sortBy: "score",
  });

  const projects = useMemo(
    () =>
      [...new Set(data.sessions.map((s) => s.projectName))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
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
      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-card__label">平均スコア</span>
          <span className="stat-card__value num">
            <strong>{formatScore(Math.round(average * 10) / 10)}</strong>
            <span>点 / 100</span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">採点済</span>
          <span className="stat-card__value num">
            <strong>{graded.length}</strong>
            <span>件 / 全{data.sessions.length}件</span>
          </span>
        </div>
      </div>

      <div className="filter-bar">
        <label className="filter-pill">
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
        <label className="filter-pill">
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
        <label className="filter-pill">
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
        <span className="filter-bar__count num">{rows.length} セッション</span>
      </div>

      {data.message !== undefined && <p className="notice">{data.message}</p>}
      {data.skipped.length > 0 && (
        <p className="notice">
          {data.skipped.length} 件のファイルを読み飛ばしました
          {data.skipped[0] !== undefined && `（例: ${data.skipped[0].reason}）`}
        </p>
      )}

      <div className="session-list">
        {rows.map((s) =>
          s.gradable ? (
            <a
              key={s.sessionId}
              className="session-card"
              href={`#/session/${encodeURIComponent(s.sessionId)}`}
            >
              <ScoreRing total={s.total} />
              <span className="session-card__mid">
                <span className="session-card__title">{s.projectName}</span>
                <span className="session-meta num">
                  <span>
                    <IconClock />
                    {formatDateTime(s.startedAt)}
                  </span>
                  <span>
                    <IconArrowRight />
                    {formatDuration(s.durationMs)}
                  </span>
                  <span>
                    <IconActivity />
                    {s.assistantTurns} ターン
                  </span>
                </span>
              </span>
              <span className="session-card__right">
                <span className="session-card__right-label">主な減点</span>
                {s.topDeduction === null ? (
                  <span className="deduction-tag">—</span>
                ) : (
                  <span className="deduction-tag">
                    <span
                      className="deduction-tag__dot"
                      style={{ background: scoreColor(s.total) }}
                    />
                    {RULE_LABELS[s.topDeduction.id] ?? s.topDeduction.id}
                  </span>
                )}
                <span className="chevron">
                  <IconChevronRight />
                </span>
              </span>
            </a>
          ) : (
            <div
              key={s.sessionId}
              className="session-card session-card--ungraded"
            >
              <span className="ungraded-mark">
                <IconMinus />
              </span>
              <span className="session-card__mid">
                <span className="session-card__title">{s.projectName}</span>
                <span className="session-meta num">
                  <span>
                    <IconClock />
                    {formatDateTime(s.startedAt)}
                  </span>
                  <span>
                    <IconActivity />
                    {s.assistantTurns} ターン
                  </span>
                </span>
              </span>
              <span className="session-card__right">
                <span className="ungraded-badge">採点対象外</span>
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
