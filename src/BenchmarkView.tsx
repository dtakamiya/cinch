import { useMemo, useState } from "react";
import type { SessionsResponse } from "../shared/types.js";
import {
  buildBenchmark,
  sortBenchmarkRows,
  MIN_GRADED_FOR_STATS,
  type BenchmarkPeriod,
  type BenchmarkRow,
  type BenchmarkSortKey,
  type BoxStats,
} from "./benchmark.js";
import { CATEGORY_LABELS, RULE_LABELS, formatScore, scoreColor } from "./format.js";
import { routeToHash } from "./route.js";
import { IconChevronLeft } from "./icons.js";

const PERIODS: { value: BenchmarkPeriod; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "1d", label: "24 時間" },
  { value: "7d", label: "7 日" },
  { value: "30d", label: "30 日" },
];

const SORT_KEYS: { value: BenchmarkSortKey; label: string }[] = [
  { value: "median", label: "総合スコア中央値" },
  { value: "count", label: "採点済み件数" },
  { value: "cost", label: "コスト効率 率" },
  { value: "productivity", label: "生産性 率" },
  { value: "practice", label: "ベストプラクティス 率" },
];

/**
 * #/benchmark。採点済み 1 件以上の全プロジェクトを 1 テーブルに並べる。
 * 新エンドポイント・型変更なしで、GET /api/sessions の SessionSummary[] だけを入力にする。
 */
export function BenchmarkView({ data }: { data: SessionsResponse }) {
  const [period, setPeriod] = useState<BenchmarkPeriod>("all");
  const [sortKey, setSortKey] = useState<BenchmarkSortKey>("median");
  // 既定は「下手な順」= median 昇順（AC3）
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const benchmark = useMemo(
    () => buildBenchmark(data.sessions, { period }),
    [data.sessions, period],
  );

  const rows = useMemo(
    () => sortBenchmarkRows(benchmark.rows, sortKey, direction),
    [benchmark.rows, sortKey, direction],
  );

  return (
    <div className="benchmark">
      <div className="benchmark__head">
        <div>
          <h2 className="benchmark__title">プロジェクト横断ベンチマーク</h2>
          <p className="benchmark__sub num">
            {benchmark.projectCount} プロジェクト ・ 期間内に採点済みが 1 件以上あるもの
          </p>
        </div>
        <a className="link" href={routeToHash({ name: "list" })}>
          <IconChevronLeft />
          一覧に戻る
        </a>
      </div>

      <div className="benchmark__controls">
        <label className="filter-pill">
          期間
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as BenchmarkPeriod)}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-pill">
          並び替え
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as BenchmarkSortKey)}
          >
            {SORT_KEYS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-pill">
          <input
            type="checkbox"
            checked={direction === "desc"}
            onChange={(e) => setDirection(e.target.checked ? "desc" : "asc")}
          />
          降順（上手い順）
        </label>
        <span className="benchmark__hint num">
          統計は採点済み {MIN_GRADED_FOR_STATS} 件以上のプロジェクトのみ
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="notice">この期間に採点済みセッションのあるプロジェクトはありません。</p>
      ) : (
        <div className="benchmark__scroll">
          <table className="benchmark__table num">
            <thead>
              <tr>
                <th className="benchmark__th--left">プロジェクト</th>
                <th>採点済み</th>
                <th>総合スコア中央値</th>
                <th>分布</th>
                <th>{CATEGORY_LABELS.cost}</th>
                <th>{CATEGORY_LABELS.productivity}</th>
                <th>{CATEGORY_LABELS.practice}</th>
                <th className="benchmark__th--left">最頻の減点</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <BenchmarkTableRow key={row.projectName} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function BenchmarkTableRow({ row }: { row: BenchmarkRow }) {
  // テーブル行のクリックで該当プロジェクトのセッション一覧へ絞り込み遷移（AC10）。
  // 遷移先の hash に project を載せることで絞り込み state を URL に同期する。
  const href = routeToHash({ name: "list", project: row.projectName });

  return (
    <tr className="benchmark__row">
      <td className="benchmark__th--left">
        <a className="benchmark__project-link" href={href}>
          {row.projectName}
        </a>
        {row.declines.length > 0 && (
          <span className="benchmark__warn" role="status">
            ⚠ {row.declines.map((d) => CATEGORY_LABELS[d.category]).join("・")}が悪化
          </span>
        )}
      </td>
      <td>{row.gradedCount}</td>
      <td>
        {row.medianScore === null ? (
          <span className="benchmark__muted">—</span>
        ) : (
          <span style={{ color: scoreColor(row.medianScore) }}>
            {formatScore(row.medianScore)}
          </span>
        )}
      </td>
      <td>
        {row.box === null ? (
          <span className="benchmark__muted">—</span>
        ) : (
          <MiniBoxPlot box={row.box} />
        )}
      </td>
      <td>{pct(row.categoryMedian.cost)}</td>
      <td>{pct(row.categoryMedian.productivity)}</td>
      <td>{pct(row.categoryMedian.practice)}</td>
      <td className="benchmark__th--left">
        {row.topDeduction === null ? (
          <span className="benchmark__muted">—</span>
        ) : (
          <span className="benchmark__deduction">
            {RULE_LABELS[row.topDeduction.id] ?? row.topDeduction.id}
            <span className="benchmark__deduction-count">
              ×{row.topDeduction.count}
            </span>
          </span>
        )}
      </td>
    </tr>
  );
}

/** 総合スコア（0〜100）の 5 数要約を横向きミニ箱ひげで描く。 */
function MiniBoxPlot({ box }: { box: BoxStats }) {
  const W = 120;
  const H = 20;
  const pad = 2;
  const x = (v: number) =>
    pad + (Math.min(100, Math.max(0, v)) / 100) * (W - pad * 2);

  const boxLeft = x(box.q1);
  const boxRight = x(box.q3);
  const midY = H / 2;

  return (
    <svg
      className="benchmark__box"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`最小 ${formatScore(box.min)} / Q1 ${formatScore(box.q1)} / 中央値 ${formatScore(box.median)} / Q3 ${formatScore(box.q3)} / 最大 ${formatScore(box.max)}`}
    >
      {/* ひげ */}
      <line
        x1={x(box.min)}
        x2={x(box.max)}
        y1={midY}
        y2={midY}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {/* 箱 */}
      <rect
        x={boxLeft}
        y={midY - 5}
        width={Math.max(1, boxRight - boxLeft)}
        height={10}
        fill="var(--accent-soft)"
        stroke="var(--accent-line)"
        strokeWidth={1}
      />
      {/* 中央値 */}
      <line
        x1={x(box.median)}
        x2={x(box.median)}
        y1={midY - 6}
        y2={midY + 6}
        stroke={scoreColor(box.median)}
        strokeWidth={2}
      />
    </svg>
  );
}
