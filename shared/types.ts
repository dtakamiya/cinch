// ---- パース層: JSONL 1 行の正規化結果 ----

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  toolUseId: string;
  isError: boolean;
  byteLength: number;
}

export interface Usage {
  input: number;
  output: number;
  cacheCreate: number;
  cacheCreate1h: number;
  cacheCreate5m: number;
  cacheRead: number;
}

export function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheCreate: 0,
    cacheCreate1h: 0,
    cacheCreate5m: 0,
    cacheRead: 0,
  };
}

export type Event =
  | { kind: "user"; ts: string; toolResults: ToolResult[] }
  | {
      kind: "assistant";
      ts: string;
      model: string;
      effort: string | null;
      usage: Usage;
      toolUses: ToolUse[];
      isSidechain: boolean;
    }
  | {
      kind: "meta";
      ts: string | null;
      cwd: string;
      version: string;
      gitBranch: string | null;
      permissionMode: string | null;
    };

// ---- 集計層: 数え上げの結果（判断を含まない） ----

export interface SessionMetrics {
  sessionId: string;
  cwd: string;
  projectName: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  assistantTurns: number;
  models: Record<string, number>;
  totals: Usage;
  toolCalls: number;
  toolErrors: number;
  toolsByName: Record<string, { calls: number; errors: number }>;
  redundantReads: number;
  parallelizableSequences: number;
  parallelizableOpportunities: number;
  sidechainTurns: number;
  heavyExplorationTurns: number;
  simpleWorkTurns: number;
  simpleWorkOnExpensiveModel: number;
  contextGrowth: number[];
  cacheExpirations: number;
  cache1hCreations: number;
  hasClaudeMd: boolean;
  gitBranch: string | null;
  version: string;
  /** largeResultBytes を超えた tool_result の件数 */
  oversizedResults: number;
  /** 最大の tool_result バイト長（無ければ 0） */
  largestResultBytes: number;
  /** その最大結果を出したツール名（無ければ null） */
  largestResultTool: string | null;
  /** ファイルを変更したツール呼び出し（Edit / Write / NotebookEdit）の回数 */
  editCalls: number;
  /** テスト・ビルド等の検証コマンドを実行した Bash 呼び出しの回数 */
  verificationCalls: number;
  /** 専用ツールで代替できた Bash 呼び出し（cat / ls / grep など）の回数 */
  bashInsteadOfTool: number;
  /** その内訳（コマンド名 → 回数） */
  bashInsteadOfToolByCommand: Record<string, number>;
  /** 1 ターンで送られた文脈の最大トークン数（input + cacheRead + cacheCreate） */
  peakContextTokens: number;
  parseErrors: number;
}

// ---- 採点層 ----

export const CATEGORIES = ["cost", "productivity", "practice"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface EvaluatedRule {
  id: string;
  category: Category;
  earned: number;
  max: number;
  evidence: string;
  advice: string | null;
}

export interface SessionScore {
  sessionId: string;
  total: number;
  gradable: boolean;
  categories: Record<Category, { earned: number; max: number }>;
  /**
   * 失点（`max - earned`）の降順でソート済み。`rules[0]` が最も失点の大きいルール。
   * この順序は `computeScore`（server/score.ts）の契約で、UI が `rules[0]` を
   * 「最大の失点」として参照している（cinch-015）。
   */
  rules: EvaluatedRule[];
}

// ---- API 層 ----

export interface SessionSummary {
  sessionId: string;
  projectName: string;
  cwd: string;
  startedAt: string;
  durationMs: number;
  assistantTurns: number;
  total: number;
  gradable: boolean;
  categories: Record<Category, { earned: number; max: number }>;
  topDeduction: { id: string; lost: number } | null;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface SessionsResponse {
  sessions: SessionSummary[];
  scannedAt: string;
  projectCount: number;
  skipped: SkippedFile[];
  message?: string;
}

export interface SessionDetailResponse {
  metrics: SessionMetrics;
  score: SessionScore;
}

// ---- ルール別スコア推移（cinch-023） ----

/**
 * 推移の窓分割オプション。
 * - `bucketKind`: 窓の切り方。`"week"`（既定・ISO 8601 週）or `"session-window"`。
 * - `windowSize`: `session-window` のときの N（末尾 N 件 / その手前 N 件）。
 *   `session-window` のときのみ有効・デフォルト 5・`"week"` のときは無視する。
 *
 * cinch-018（src/categoryTrend.ts）のローカル同型定義をここに一本化したもの。
 */
export interface TrendWindowOption {
  bucketKind: "week" | "session-window";
  windowSize?: 3 | 5 | 10;
}

/** 1 ルール・1 バケット分の集計点。 */
export interface RuleTrendPoint {
  /**
   * 週バケット: ISO 8601 週キー（例 "2026-W05"）。
   * セッション窓バケット: `"previous"` | `"current"`。
   * いずれも X 軸／React のキーに使う一意な文字列。
   */
  bucketKey: string;
  /** そのバケットでこのルールが獲得した earned の合計 */
  earned: number;
  /** そのバケットのこのルールの max の合計 */
  max: number;
  /** earned / max。max が 0（該当ルールのデータが無い）のときは null */
  rate: number | null;
  /** そのバケットに集計対象になった採点済みセッション数 */
  sessions: number;
}

/** 1 ルール分の推移系列。 */
export interface RuleTrendBucket {
  /** ルール id（server/rules/*.ts の Rule.id と一致） */
  id: string;
  category: Category;
  points: RuleTrendPoint[];
  /**
   * 最新バケットの rate − 直前バケットの rate。
   * どちらかの rate が null、またはバケットが 2 つ未満なら null。
   */
  delta: number | null;
}

export interface RuleTrendsResponse {
  projectName: string;
  bucketKind: "week" | "session-window";
  /** `session-window` のときの N。`"week"` のときは null。 */
  windowSize: number | null;
  /**
   * 推移を出すのに十分なデータがあるか。
   * 直近バケットが空、または比較対象バケットが空（採点済みセッションが無い）なら false。
   */
  hasEnoughData: boolean;
  /**
   * delta の昇順（悪化が大きい順）でソート済み。delta が null のルールは末尾に寄せる。
   * hasEnoughData が false のときは空配列。
   */
  rules: RuleTrendBucket[];
  /** hasEnoughData が false のときの説明文 */
  message?: string;
}
