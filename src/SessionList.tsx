import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionSummary, SessionsResponse } from "../shared/types.js";
import { ScoreRing } from "./ScoreRing.js";
import { ScoreTrend } from "./ScoreTrend.js";
import { CategoryScoreTrends } from "./CategoryScoreTrends.js";
import { RuleScoreTrends } from "./RuleScoreTrends.js";
import { routeToHash } from "./route.js";
import { RULE_LABELS } from "./format.js";
import {
  IconActivity,
  IconArrowRight,
  IconChevronRight,
  IconClock,
  IconMinus,
} from "./icons.js";
import {
  formatDateTime,
  formatDuration,
  formatScore,
  scoreColor,
} from "./format.js";
import { toDeductionView } from "./deduction.js";

export interface Filters {
  project: string;
  period: string;
  sortBy: "score" | "date";
  showUngraded: boolean;
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
    if (!filters.showUngraded && !s.gradable) return false;
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

/** サマリー集計を純粋関数として切り出す（フィルタ後の行に追従させ、UI を介さずテストできるように） */
export function summarize(rows: SessionSummary[]): {
  avg: number;
  graded: number;
  total: number;
} {
  const gradable = rows.filter((s) => s.gradable);
  const avg =
    gradable.length === 0
      ? 0
      : gradable.reduce((sum, s) => sum + s.total, 0) / gradable.length;
  return { avg, graded: gradable.length, total: rows.length };
}

export function SessionList({
  data,
  initialProject = "",
  initialRule = "",
}: {
  data: SessionsResponse;
  /** URL(hash) から復元したプロジェクト絞り込み（cinch-016 AC10）。 */
  initialProject?: string;
  /**
   * URL(hash) から復元した、ルール別スコア推移からの絞り込み（cinch-023）。
   * 設定されていると、プロジェクト内でそのルールが「主な減点」になっているセッションだけを
   * 減点の大きい順に表示する。
   */
  initialRule?: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    project: initialProject,
    period: "all",
    sortBy: "date",
    showUngraded: false,
  });
  const [ruleFilter, setRuleFilter] = useState(initialRule);

  // プロジェクト・ルール絞り込みを URL(hash) に同期する（AC10 / cinch-023）。
  // 初回は初期値と一致するので書き込まない。以後、変更があったときだけ hash を書き換える。
  const lastSynced = useRef({ project: initialProject, rule: initialRule });
  useEffect(() => {
    if (
      filters.project === lastSynced.current.project &&
      ruleFilter === lastSynced.current.rule
    ) {
      return;
    }
    lastSynced.current = { project: filters.project, rule: ruleFilter };
    const nextHash = routeToHash({
      name: "list",
      project: filters.project,
      rule: ruleFilter === "" ? undefined : ruleFilter,
    });
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, [filters.project, ruleFilter]);

  // 外側（戻る/進む・ベンチマークからの遷移）で initialProject / initialRule が変わったら追従する。
  useEffect(() => {
    lastSynced.current = { project: initialProject, rule: initialRule };
    setFilters((f) =>
      f.project === initialProject ? f : { ...f, project: initialProject },
    );
    setRuleFilter((r) => (r === initialRule ? r : initialRule));
  }, [initialProject, initialRule]);

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

  // プロジェクトを選んでいるときは、そのプロジェクトの全セッションを推移に渡す
  // （期間フィルタで推移が途切れないよう、rows ではなく data.sessions から絞る）
  const trendSessions = useMemo(
    () =>
      filters.project === ""
        ? []
        : data.sessions.filter((s) => s.projectName === filters.project),
    [data.sessions, filters.project],
  );

  // ルール別スコア推移の行クリックから来た絞り込み。対象ルールが「主な減点」になっている
  // セッションだけを、そのルールでの失点が大きい順に表示する（cinch-023）。
  const ruleFilteredSessions = useMemo(() => {
    if (ruleFilter === "") return null;
    const base =
      filters.project === ""
        ? data.sessions
        : data.sessions.filter((s) => s.projectName === filters.project);
    return base
      .filter((s) => s.gradable && s.topDeduction?.id === ruleFilter)
      .sort((a, b) => (b.topDeduction?.lost ?? 0) - (a.topDeduction?.lost ?? 0));
  }, [data.sessions, filters.project, ruleFilter]);

  const { avg, graded, total } = summarize(rows);

  return (
    <div className="list">
      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-card__label">平均スコア</span>
          <span className="stat-card__value num">
            <strong>{formatScore(Math.round(avg * 10) / 10)}</strong>
            <span>点 / 100</span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">採点済</span>
          <span className="stat-card__value num">
            <strong>{graded}</strong>
            <span>件 / 全{total}件</span>
          </span>
        </div>
      </div>

      <div className="filter-bar">
        <label className="filter-pill">
          プロジェクト
          <select
            value={filters.project}
            onChange={(e) => {
              setFilters({ ...filters, project: e.target.value });
              setRuleFilter("");
            }}
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
            <option value="date">新しい順</option>
            <option value="score">スコア順</option>
          </select>
        </label>
        <label className="filter-pill">
          <input
            type="checkbox"
            checked={filters.showUngraded}
            onChange={(e) =>
              setFilters({ ...filters, showUngraded: e.target.checked })
            }
          />
          採点対象外を表示
        </label>
        <span className="filter-bar__count num">{rows.length} セッション</span>
        {data.scannedAt !== "" && (
          <span className="filter-bar__scanned num">
            最終スキャン {formatDateTime(data.scannedAt)}
          </span>
        )}
      </div>

      {data.message !== undefined && <p className="notice">{data.message}</p>}
      {data.skipped.length > 0 && (
        <p className="notice">
          {data.skipped.length} 件のファイルを読み飛ばしました
          {data.skipped[0] !== undefined && `（例: ${data.skipped[0].reason}）`}
        </p>
      )}

      {filters.project !== "" && (
        <>
          <ScoreTrend sessions={trendSessions} projectName={filters.project} />
          <CategoryScoreTrends
            sessions={trendSessions}
            projectName={filters.project}
          />
          <RuleScoreTrends
            projectName={filters.project}
            onSelectRule={(ruleId) => setRuleFilter(ruleId)}
          />
        </>
      )}

      {ruleFilteredSessions !== null && (
        <div className="rule-filter-banner">
          <span>
            {RULE_LABELS[ruleFilter] ?? ruleFilter} の減点が大きいセッション（
            {ruleFilteredSessions.length} 件）
          </span>
          <button
            type="button"
            className="link"
            onClick={() => setRuleFilter("")}
          >
            絞り込みを解除
          </button>
        </div>
      )}

      <div className="session-list">
        {(ruleFilteredSessions ?? rows).map((s) =>
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
                {(() => {
                  const dv = toDeductionView(s.topDeduction);
                  return dv === null ? (
                    <span className="deduction-tag">—</span>
                  ) : (
                    <span className="deduction-tag">
                      <span
                        className="deduction-tag__dot"
                        style={{ background: scoreColor(s.total) }}
                      />
                      {dv.label}
                      <span className="deduction-tag__lost num">
                        {dv.lostLabel}
                      </span>
                    </span>
                  );
                })()}
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
