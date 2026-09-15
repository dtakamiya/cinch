import { useEffect, useState } from "react";
import type { RuleTrendBucket, RuleTrendsResponse } from "../shared/types.js";
import { fetchRuleTrends } from "./api.js";
import { RULE_LABELS } from "./format.js";
import { IconTrendDown, IconTrendUp } from "./icons.js";

type BucketKind = "week" | "session-window";
type WindowSize = 3 | 5 | 10;

const WINDOW_SIZES: WindowSize[] = [3, 5, 10];

function deltaDirection(delta: number | null): "up" | "down" | "flat" | "none" {
  if (delta === null) return "none";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function pctLabel(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function deltaLabel(delta: number | null): string {
  if (delta === null) return "—";
  const pts = Math.round(delta * 100);
  return pts > 0 ? `+${pts}pt` : `${pts}pt`;
}

function ruleLabel(id: string): string {
  return RULE_LABELS[id] ?? id;
}

/**
 * ルール別（15ルール）のスコア推移。GET /api/projects/:projectName/rule-trends を叩き、
 * 改善 Top3 / 悪化 Top3 と全ルールのスパークラインを描く（cinch-023）。
 * 行（ルール）をクリックすると、そのルールの減点が最大のセッション一覧に遷移できる
 * （onSelectRule 経由。実際のフィルタリングは呼び出し側 = SessionList が行う）。
 *
 * 総合スコア推移（ScoreTrend）・カテゴリ別推移（CategoryScoreTrends）と同じく、
 * 採点済みが 2 件未満などデータ不足のプロジェクトではセクションごと出さない。
 */
export function RuleScoreTrends({
  projectName,
  onSelectRule,
}: {
  projectName: string;
  onSelectRule?: (ruleId: string) => void;
}) {
  const [bucketKind, setBucketKind] = useState<BucketKind>("week");
  const [windowSize, setWindowSize] = useState<WindowSize>(5);
  const [data, setData] = useState<RuleTrendsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchRuleTrends(
      projectName,
      bucketKind === "week" ? { bucketKind: "week" } : { bucketKind, windowSize },
    )
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectName, bucketKind, windowSize]);

  if (error !== null) {
    return <p className="notice">ルール別スコア推移の取得に失敗しました: {error}</p>;
  }

  if (data === null) {
    // 未取得（読み込み中）は何も描かない。一覧側のローディング表示に任せる。
    return null;
  }

  // 採点済みセッションが 0 件（プロジェクト自体にデータが無い）ならセクションごと出さない。
  if (data.message !== undefined && data.message.includes("採点済みセッションがありません")) {
    return null;
  }

  const nonNull = data.hasEnoughData ? data.rules.filter((r) => r.delta !== null) : [];
  const worsened = nonNull.slice(0, 3);
  const improved = nonNull.slice(-3).reverse();

  return (
    <section
      className="rule-trend"
      aria-label={`${projectName} のルール別スコア推移`}
    >
      <div className="rule-trend__head">
        <span className="rule-trend__title">
          {projectName} のルール別 獲得率推移
        </span>
      </div>

      <div className="rule-trend__controls">
        <label className="filter-pill">
          区切り
          <select
            value={bucketKind}
            onChange={(e) => setBucketKind(e.target.value as BucketKind)}
          >
            <option value="week">週</option>
            <option value="session-window">直近N件</option>
          </select>
        </label>
        {bucketKind === "session-window" && (
          <label className="filter-pill">
            件数
            <select
              value={windowSize}
              onChange={(e) =>
                setWindowSize(Number(e.target.value) as WindowSize)
              }
            >
              {WINDOW_SIZES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!data.hasEnoughData ? (
        <p className="notice">{data.message}</p>
      ) : (
        <>
          <div className="rule-trend__top3">
            <RuleTop3 title="悪化 Top3" items={worsened} onSelectRule={onSelectRule} />
            <RuleTop3 title="改善 Top3" items={improved} onSelectRule={onSelectRule} />
          </div>

          <div className="rule-trend__grid">
            {data.rules.map((r) => (
              <RuleSparkline
                key={r.id}
                bucket={r}
                onClick={onSelectRule === undefined ? undefined : () => onSelectRule(r.id)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function RuleTop3({
  title,
  items,
  onSelectRule,
}: {
  title: string;
  items: RuleTrendBucket[];
  onSelectRule?: (ruleId: string) => void;
}) {
  return (
    <div className="rule-trend__top3-col">
      <span className="rule-trend__top3-title">{title}</span>
      {items.length === 0 ? (
        <p className="rule-trend__top3-empty">対象なし</p>
      ) : (
        <ul className="rule-trend__top3-list">
          {items.map((r) => {
            const dir = deltaDirection(r.delta);
            const clickable = onSelectRule !== undefined;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className="rule-trend__top3-item"
                  disabled={!clickable}
                  onClick={clickable ? () => onSelectRule(r.id) : undefined}
                >
                  <span className="rule-trend__top3-label">{ruleLabel(r.id)}</span>
                  <span
                    className={`rule-trend__top3-delta rule-trend__top3-delta--${dir} num`}
                  >
                    {dir === "up" && (
                      <span aria-label="上昇">
                        <IconTrendUp />
                      </span>
                    )}
                    {dir === "down" && (
                      <span aria-label="下降">
                        <IconTrendDown />
                      </span>
                    )}
                    {deltaLabel(r.delta)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 1 ルール分の 0〜1 スケール スパークライン + 直近デルタ。クリックで該当ルールへ絞り込める。 */
function RuleSparkline({
  bucket,
  onClick,
}: {
  bucket: RuleTrendBucket;
  onClick?: () => void;
}) {
  const { id, points, delta } = bucket;
  const dir = deltaDirection(delta);

  const W = 200;
  const H = 56;
  const padX = 6;
  const padTop = 6;
  const padBottom = 6;

  const n = points.length;
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, n - 1);
  const y = (v: number | null) =>
    padTop + (1 - Math.min(1, Math.max(0, v ?? 0))) * (H - padTop - padBottom);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.rate).toFixed(1)}`)
    .join(" ");

  const last = points[n - 1];

  return (
    <button
      type="button"
      className="rule-spark"
      data-direction={dir}
      onClick={onClick}
      aria-label={`${ruleLabel(id)} のスコア推移。最大失点セッション一覧に遷移`}
    >
      <div className="rule-spark__head">
        <span className="rule-spark__label">{ruleLabel(id)}</span>
        <span className={`rule-spark__delta rule-spark__delta--${dir} num`}>
          {dir === "up" && (
            <span aria-label="上昇">
              <IconTrendUp />
            </span>
          )}
          {dir === "down" && (
            <span aria-label="下降">
              <IconTrendDown />
            </span>
          )}
          {deltaLabel(delta)}
        </span>
      </div>

      <svg
        className="rule-spark__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden="true"
      >
        {[0, 0.5, 1].map((v) => (
          <line
            key={v}
            x1={padX}
            x2={W - padX}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--border-soft)"
            strokeWidth={1}
          />
        ))}
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle key={p.bucketKey} cx={x(i)} cy={y(p.rate)} r={2.5} fill="var(--accent)" />
        ))}
      </svg>

      <div className="rule-spark__foot num">
        最新 {pctLabel(last?.rate ?? null)}
      </div>
    </button>
  );
}
