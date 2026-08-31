import type { Category } from "../shared/types.js";

/**
 * フロント側の『ルールID → カテゴリ』対応表。
 *
 * server 側（server/rules/*.ts の各 `category` フィールド）と 1:1 で一致させること。
 * cinch-015(b) で server が返す `RuleTrendBucket.category` とそのまま突き合う形にするため、
 * 二重定義を生まないよう **この 1 箇所だけ** をフロントの正とする。
 * （現状 GET /api/sessions の SessionSummary にはルール単位のデータが無いので、
 *  015a のカテゴリ推移集計自体は SessionSummary.categories をそのまま使い、この表は
 *  参照しない。(b) でルール別バケットを描くときにこの表で色分け・グループ化する。）
 */
export const RULE_CATEGORY: Record<string, Category> = {
  // コスト効率
  "cache-efficiency": "cost",
  "cache-ttl-waste": "cost",
  "model-fit": "cost",
  "context-window-headroom": "cost",
  // 生産性
  "tool-error-rate": "productivity",
  "redundant-file-reads": "productivity",
  "parallel-tool-use": "productivity",
  "turn-efficiency": "productivity",
  "oversized-tool-results": "productivity",
  "bash-over-native-tools": "productivity",
  // ベストプラクティス
  "subagent-delegation": "practice",
  "context-growth": "practice",
  "claude-md-present": "practice",
  "task-planning": "practice",
  "verification-gap": "practice",
};

/** 未知の id は null。呼び出し側で握りつぶすかフォールバックするか決める。 */
export function categoryOf(ruleId: string): Category | null {
  return RULE_CATEGORY[ruleId] ?? null;
}
