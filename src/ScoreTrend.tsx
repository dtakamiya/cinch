import { useMemo } from "react";
import type { SessionSummary } from "../shared/types.js";
import { buildTrend } from "./trend.js";
import { formatDateTime, formatScore, scoreColor } from "./format.js";
import { IconTrendDown, IconTrendUp } from "./icons.js";

/**
 * 同一プロジェクトのスコア推移を SVG の折れ線で描く。
 * 生の点（薄い折れ線 + ドット）に移動平均線を重ねる。
 * 採点済みが 2 件未満のときは推移として意味がないので何も描かない。
 */
export function ScoreTrend({
  sessions,
  projectName,
}: {
  sessions: SessionSummary[];
  projectName: string;
}) {
  const trend = useMemo(() => buildTrend(sessions), [sessions]);
  const { points, delta } = trend;

  if (points.length < 2) return null;

  // viewBox 座標系（レスポンシブは CSS 側で width:100% にして拡縮）
  const W = 640;
  const H = 180;
  const padX = 16;
  const padTop = 16;
  const padBottom = 24;

  const n = points.length;
  const x = (i: number) =>
    padX + (i * (W - padX * 2)) / Math.max(1, n - 1);
  // Y は 0〜100 固定スケール。セッション間の絶対比較ができるように動的スケールにしない。
  const y = (v: number) =>
    padTop + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - padTop - padBottom);

  const rawPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`)
    .join(" ");
  const avgPath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.movingAvg).toFixed(1)}`,
    )
    .join(" ");

  // points.length >= 2 はチェック済みなので first / last は必ず存在する
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const deltaLabel =
    delta > 0 ? `+${formatScore(delta)}` : formatScore(delta);
  const deltaClass =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <section className="trend" aria-label={`${projectName} のスコア推移`}>
      <div className="trend__head">
        <div>
          <span className="trend__title">{projectName} のスコア推移</span>
          <span className="trend__sub num">
            {n} セッション ・ 初回 {formatScore(first.total)} → 最新{" "}
            {formatScore(last.total)}
          </span>
          <span className="trend__range num">
            {formatDateTime(first.startedAt)} 〜 {formatDateTime(last.startedAt)}
          </span>
        </div>
        <span
          className={`trend__delta trend__delta--${deltaClass} num`}
          data-direction={deltaClass}
        >
          {deltaClass === "up" && (
            <span className="trend__delta-icon" aria-label="上昇">
              <IconTrendUp />
            </span>
          )}
          {deltaClass === "down" && (
            <span className="trend__delta-icon" aria-label="下降">
              <IconTrendDown />
            </span>
          )}
          {deltaLabel} 点
        </span>
      </div>

      <svg
        className="trend__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden="true"
      >
        {/* 目盛り: 0 / 50 / 100 */}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={padX}
              x2={W - padX}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border-soft)"
              strokeWidth={1}
            />
            <text
              x={padX}
              y={y(v) - 3}
              fontSize={10}
              fill="var(--faint)"
            >
              {v}
            </text>
          </g>
        ))}

        {/* 生スコアの折れ線（薄め） */}
        <path
          d={rawPath}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1.5}
        />
        {/* 移動平均線（主役） */}
        <path
          d={avgPath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 各セッションの点。色はスコア帯（good/warn/bad） */}
        {points.map((p, i) => (
          <circle
            key={p.sessionId}
            cx={x(i)}
            cy={y(p.total)}
            r={3}
            fill={scoreColor(p.total)}
          />
        ))}
      </svg>

      <div className="trend__legend num">
        <span>
          <span className="trend__swatch trend__swatch--avg" />
          移動平均（直近 5 件）
        </span>
        <span>
          <span className="trend__swatch trend__swatch--raw" />
          セッション別スコア
        </span>
      </div>
    </section>
  );
}
