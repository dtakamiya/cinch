import { formatScore, scoreColor } from "./format.js";

/**
 * スコアを円形リングで表す。一覧・詳細で共用。
 * total(0〜100) を弧長に変換し、12 時方向から時計回りに塗る。
 * 色は scoreColor（80 / 60 の閾値で good / warn / bad）。
 */
export function ScoreRing({
  total,
  size = 64,
}: {
  total: number;
  size?: number;
}) {
  const stroke = size >= 96 ? 8 : size >= 72 ? 6 : 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, total));
  const on = (clamped / 100) * circumference;
  const c = size / 2;

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={scoreColor(total)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${on.toFixed(1)} ${(circumference - on).toFixed(1)}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <span
        className="score-ring__num"
        style={{ fontSize: Math.round(size * 0.28) }}
      >
        {formatScore(total)}
      </span>
    </div>
  );
}
