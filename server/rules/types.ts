import type { Category, SessionMetrics } from "../../shared/types.js";
import type { RuleId } from "../config/thresholds.js";

export interface RuleResult {
  /** 0.0〜1.0（1.0 が満点） */
  score: number;
  /** 減点の根拠となる事実。例: "ツール呼び出し47回中12回が失敗（25.5%）" */
  evidence: string;
  /** 改善案。満点なら null */
  advice: string | null;
}

export interface Rule {
  id: RuleId;
  category: Category;
  weight: number;
  /** UI に出す日本語のルール名 */
  label: string;
  evaluate(m: SessionMetrics): RuleResult;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * 値が小さいほど良い指標を 0〜1 に写す。
 * value <= perfectBelow で 1.0、value >= zeroAbove で 0。
 */
export function scaleDown(
  value: number,
  perfectBelow: number,
  zeroAbove: number,
): number {
  if (value <= perfectBelow) return 1;
  if (value >= zeroAbove) return 0;
  return clamp01((zeroAbove - value) / (zeroAbove - perfectBelow));
}

/**
 * 値が大きいほど良い指標を 0〜1 に写す。
 * value >= perfectAbove で 1.0、value <= zeroBelow で 0。
 */
export function scaleUp(
  value: number,
  zeroBelow: number,
  perfectAbove: number,
): number {
  if (value >= perfectAbove) return 1;
  if (value <= zeroBelow) return 0;
  return clamp01((value - zeroBelow) / (perfectAbove - zeroBelow));
}

export function perfect(evidence: string): RuleResult {
  return { score: 1, evidence, advice: null };
}

/** 0.2551 → "25.5%" */
export function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
