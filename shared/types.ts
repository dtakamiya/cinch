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
