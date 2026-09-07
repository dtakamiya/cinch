import { useMemo, useState } from "react";
import type { SessionSummary } from "../shared/types.js";
import {
  buildCategoryTrends,
  deltaDirection,
  type CategoryTrendSeries,
} from "./categoryTrend.js";
import { CATEGORY_LABELS } from "./format.js";
import { IconTrendDown, IconTrendUp } from "./icons.js";

type BucketKind = "week" | "session-window";
type WindowSize = 3 | 5 | 10;

const WINDOW_SIZES: WindowSize[] = [3, 5, 10];

/**
 * 総合スコア推移（ScoreTrend）の下に置く、カテゴリ別（cost / productivity / practice）の
 * 週次獲得率推移。sum(earned) / sum(max) をプロジェクト × 週で集計し、先週比デルタを添える。
 *
 * 新エンドポイント・shared/types.ts の型変更なしで動く（入力は GET /api/sessions の
 * SessionSummary[] のみ）。cinch-015(b) の server 側バケット API が入ったら、ここを
 * その API 出力に差し替えられる形にしてある（categoryTrend.ts が集計の唯一の実装）。
 *
 * 採点済みが 2 件未満のプロジェクトはセクション自体を出さない
 * （既存 ScoreTrend の points.length < 2 と同じガード）。
 */
export function CategoryScoreTrends({
  sessions,
  projectName,
}: {
  sessions: SessionSummary[];
  projectName: string;
}) {
  const [bucketKind, setBucketKind] = useState<BucketKind>("week");
  const [windowSize, setWindowSize] = useState<WindowSize>(5);

  const trends = useMemo(
    () => buildCategoryTrends(sessions, projectName, { bucketKind, windowSize }),
    [sessions, projectName, bucketKind, windowSize],
  );

  // 総合推移と同じ「採点済み 2 件未満は出さない」ガード
  if (trends.gradedCount < 2) return null;

  // week モードで週が 1 つしか無い（＝推移として意味がない）ときは、
  // 従来どおりセクションごと出さない（トグルも表示しない）。
  const weekCount = trends.series[0]?.points.length ?? 0;
  if (bucketKind === "week" && weekCount < 2) return null;

  const showInsufficient =
    trends.bucketKind === "session-window" && trends.insufficient;

  return (
    <section
      className="cat-trend"
      aria-label={`${projectName} のカテゴリ別スコア推移`}
    >
      <div className="cat-trend__head">
        <span className="cat-trend__title">
          {projectName} のカテゴリ別 獲得率推移
        </span>
        <span className="cat-trend__sub num">
          {bucketKind === "week"
            ? `${weekCount} 週`
            : `直近 ${windowSize} 件`}{" "}
          ・ 採点済み {trends.gradedCount} 件
        </span>
      </div>

      <div className="cat-trend__controls">
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

      {showInsufficient ? (
        <p className="notice">
          直近 {windowSize} 件ずつの比較には採点済みセッションが{" "}
          {windowSize * 2} 件必要です（現在 {trends.gradedCount} 件）。
        </p>
      ) : (
        <div className="cat-trend__grid">
          {trends.series.map((s) => (
            <CategorySparkline key={s.category} series={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function pctLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function deltaLabel(delta: number): string {
  const pts = Math.round(delta * 100);
  return pts > 0 ? `+${pts}pt` : `${pts}pt`;
}

/** 1 カテゴリ分の 0〜1 スケール スパークライン + 先週比デルタ。 */
function CategorySparkline({ series }: { series: CategoryTrendSeries }) {
  const { category, points, delta } = series;
  const dir = deltaDirection(delta);

  // viewBox 座標系（レスポンシブは CSS 側で width:100%）
  const W = 220;
  const H = 64;
  const padX = 6;
  const padTop = 6;
  const padBottom = 6;

  const n = points.length;
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, n - 1);
  // Y は 0〜1 固定スケール（獲得率）。動的スケールにしない。
  const y = (v: number) =>
    padTop + (1 - Math.min(1, Math.max(0, v))) * (H - padTop - padBottom);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.rate).toFixed(1)}`)
    .join(" ");

  const last = points[n - 1]!;

  return (
    <div className="cat-spark" data-category={category} data-direction={dir}>
      <div className="cat-spark__head">
        <span className="cat-spark__label">{CATEGORY_LABELS[category]}</span>
        <span className={`cat-spark__delta cat-spark__delta--${dir} num`}>
          {dir === "up" && (
            <span className="cat-spark__delta-icon" aria-label="上昇">
              <IconTrendUp />
            </span>
          )}
          {dir === "down" && (
            <span className="cat-spark__delta-icon" aria-label="下降">
              <IconTrendDown />
            </span>
          )}
          {deltaLabel(delta)}
        </span>
      </div>

      <svg
        className="cat-spark__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden="true"
      >
        {/* 0 / 50% / 100% のガイド線 */}
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
          <circle key={p.weekStart} cx={x(i)} cy={y(p.rate)} r={2.5} fill="var(--accent)" />
        ))}
      </svg>

      <div className="cat-spark__foot num">
        最新 {pctLabel(last.rate)}
        <span className="cat-spark__foot-sub">
          （{last.earned}/{last.max}）
        </span>
      </div>
    </div>
  );
}
