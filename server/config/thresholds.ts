/**
 * すべての閾値をここに集約する。ルールのロジックと数値を分離することで、
 * 実データを見て数値を調整してもルールのテストが壊れない。
 * ルール実装に数値リテラルを直接書かないこと。
 */

export const WEIGHTS = {
  // コスト効率（35）
  "cache-efficiency": 15,
  "cache-ttl-waste": 10,
  "model-fit": 10,
  // 生産性（35）
  "tool-error-rate": 12,
  "redundant-file-reads": 8,
  "parallel-tool-use": 8,
  "turn-efficiency": 7,
  // ベストプラクティス（30）
  "subagent-delegation": 12,
  "context-growth": 10,
  "claude-md-present": 8,
} as const satisfies Record<string, number>;

export type RuleId = keyof typeof WEIGHTS;

export const THRESHOLDS = {
  /** assistant ターンがこれ未満なら gradable: false */
  minGradableTurns: 3,

  cacheEfficiency: {
    /** ヒット率がこれ以上なら満点 */
    perfectAbove: 0.9,
    /** ヒット率がこれ以下なら 0 点 */
    zeroBelow: 0.3,
  },

  cacheTtlWaste: {
    /** 失効率がこれ以下なら満点 */
    perfectBelow: 0.0,
    /** 失効率がこれ以上なら 0 点 */
    zeroAbove: 0.5,
    /** 1h キャッシュ作成がこれ未満なら判定しない（満点扱い） */
    minCreations: 2,
  },

  modelFit: {
    /** 高コストと見なすモデル名の部分文字列 */
    expensiveModelPatterns: ["opus"] as string[],
    /** 単純作業と見なす読み取り専用ツール */
    simpleTools: ["Read", "Grep", "Glob", "Bash", "TodoWrite"] as string[],
    /** 高コストモデルで単純作業をした割合がこれ以下なら満点 */
    perfectBelow: 0.1,
    /** その割合がこれ以上なら 0 点 */
    zeroAbove: 0.6,
  },

  toolErrorRate: {
    /** エラー率がこれ未満なら満点 */
    perfectBelow: 0.05,
    /** エラー率がこれを超えたら 0 点 */
    zeroAbove: 0.25,
    /** ツール呼び出しがこれ未満なら判定しない（満点扱い） */
    minCalls: 5,
  },

  redundantFileReads: {
    /** 冗長な再読み込みがこれ以下なら満点 */
    perfectAtMost: 0,
    /** これ以上なら 0 点 */
    zeroAtLeast: 6,
  },

  parallelToolUse: {
    /** 並列化率がこれ以上なら満点 */
    perfectAbove: 0.8,
    /** 並列化率がこれ以下なら 0 点 */
    zeroBelow: 0.2,
    /** 並列化の機会がこれ未満なら判定しない（満点扱い） */
    minOpportunities: 3,
  },

  turnEfficiency: {
    /** 1 ターンあたり出力トークンがこれ以上なら満点 */
    perfectAbove: 300,
    /** 1 ターンあたり出力トークンがこれ以下なら 0 点 */
    zeroBelow: 60,
    /** assistant ターンがこれ未満なら判定しない（満点扱い） */
    minTurns: 5,
  },

  subagentDelegation: {
    /** 委譲率がこれ以上なら満点 */
    perfectAbove: 0.5,
    /** 委譲率がこれ以下なら 0 点 */
    zeroBelow: 0.0,
    /** 大量出力を伴う探索ターンがこれ未満なら判定しない（満点扱い） */
    minHeavyTurns: 5,
    /** 1 ターンでこの数以上の探索系ツールを呼んだら「大量出力を伴う探索」 */
    heavyToolCallsPerTurn: 3,
    /** 探索系と見なすツール */
    explorationTools: ["Read", "Grep", "Glob"] as string[],
  },

  contextGrowth: {
    /** ターンあたりの平均増加トークンがこれ未満なら満点 */
    perfectBelow: 3000,
    /** ターンあたりの平均増加トークンがこれ以上なら 0 点 */
    zeroAbove: 20000,
    /** 計測に必要な最小ターン数（これ未満なら判定しない） */
    minTurns: 5,
  },
} as const;
