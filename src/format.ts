import type { Category } from "../shared/types.js";

export function formatDateTime(iso: string): string {
  if (iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return `${Math.floor(ms / 1000)}秒`;
  if (totalMinutes < 60) return `${totalMinutes}分`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`;
}

export function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * スコアの良し悪しを 3 段階の CSS 変数名で返す。
 * 円形リングや割合バーの色分けに使う。閾値は 80 / 60。
 */
export function scoreColor(total: number): string {
  if (total >= 80) return "var(--good)";
  if (total >= 60) return "var(--warn)";
  return "var(--bad)";
}

/** スコアを 3 段のブロック文字で表す。一覧で視線を走らせるときの手がかり。 */
const BLOCKS = ["▁", "▃", "▅", "█"];

export function scoreBar(total: number): string {
  const clamped = Math.min(100, Math.max(0, total));
  return Array.from({ length: 3 }, (_, i) => {
    // 各セルが担当する範囲（0-33 / 33-66 / 66-100）での埋まり具合
    const cellStart = (i * 100) / 3;
    const filled = Math.min(1, Math.max(0, (clamped - cellStart) / (100 / 3)));
    const index = Math.min(BLOCKS.length - 1, Math.floor(filled * BLOCKS.length));
    return BLOCKS[index] ?? BLOCKS[0];
  }).join("");
}

export const RULE_LABELS: Record<string, string> = {
  "cache-efficiency": "キャッシュ効率",
  "cache-ttl-waste": "キャッシュ TTL の無駄",
  "model-fit": "モデルの選択",
  "tool-error-rate": "ツールエラー率",
  "redundant-file-reads": "冗長なファイル読み込み",
  "parallel-tool-use": "ツール呼び出しの並列化",
  "turn-efficiency": "ターンあたりの生産量",
  "oversized-tool-results": "巨大なツール結果",
  "subagent-delegation": "サブエージェントへの委譲",
  "context-growth": "コンテキストの肥大",
  "claude-md-present": "CLAUDE.md の有無",
  "task-planning": "タスクの計画",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  cost: "コスト効率",
  productivity: "生産性",
  practice: "ベストプラクティス",
};
