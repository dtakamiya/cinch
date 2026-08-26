/**
 * すべての閾値をここに集約する。ルールのロジックと数値を分離することで、
 * 実データを見て数値を調整してもルールのテストが壊れない。
 * ルール実装に数値リテラルを直接書かないこと。
 */

export const WEIGHTS = {
  // コスト効率（35）
  "cache-efficiency": 12,
  "cache-ttl-waste": 10,
  "model-fit": 8,
  "context-window-headroom": 5,
  // 生産性（35）
  "tool-error-rate": 9,
  "redundant-file-reads": 6,
  "parallel-tool-use": 6,
  "turn-efficiency": 7,
  "oversized-tool-results": 4,
  "bash-over-native-tools": 3,
  // ベストプラクティス（30）
  "subagent-delegation": 7,
  "context-growth": 8,
  "claude-md-present": 4,
  "task-planning": 4,
  "verification-gap": 7,
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

  oversizedToolResults: {
    /** これを超える tool_result を「巨大」とみなす（バイト） */
    largeResultBytes: 12000,
    /** 巨大な結果がこれ以下なら満点 */
    perfectAtMost: 0,
    /** これ以上なら 0 点 */
    zeroAtLeast: 6,
    /** ツール呼び出しがこれ未満なら判定しない（満点扱い） */
    minCalls: 10,
  },

  taskPlanning: {
    /** assistant ターンがこれ未満なら判定しない（満点扱い） */
    minTurns: 15,
    /** ツール呼び出しがこれ未満なら判定しない（満点扱い） */
    minCalls: 20,
  },

  verificationGap: {
    /** 編集がこれ未満なら判定しない（満点扱い）。少数の編集なら未検証でも咎めない */
    minEdits: 3,
    /** 編集 1 件あたりの検証回数がこれ以上なら満点 */
    perfectAbove: 0.5,
    /** 編集 1 件あたりの検証回数がこれ以下なら 0 点 */
    zeroBelow: 0,
    /**
     * 検証コマンドと見なす部分文字列。Bash の command に含まれれば検証と数える。
     * 取りこぼし（検証したのに減点）を避けるため広めに取る。
     */
    commandPatterns: [
      "test",
      "build",
      "typecheck",
      "lint",
      "pytest",
      "vitest",
      "jest",
      "tsc",
      "cargo",
      "go test",
      "mvn",
      "gradle",
    ] as string[],
  },

  bashOverNativeTools: {
    /**
     * 専用ツールで代替できるコマンド。Bash の command の先頭語がこれなら数える。
     * 先頭語だけを見るのは、パイプの途中の grep などを誤検知しないため。
     */
    replaceableCommands: [
      "cat",
      "head",
      "tail",
      "sed",
      "grep",
      "rg",
      "find",
      "ls",
      "echo",
    ] as string[],
    /** 全ツール呼び出しに占める割合がこれ以下なら満点 */
    perfectBelow: 0.05,
    /** その割合がこれ以上なら 0 点 */
    zeroAbove: 0.35,
    /** ツール呼び出しがこれ未満なら判定しない（満点扱い） */
    minCalls: 10,
  },

  contextWindowHeadroom: {
    /**
     * 基準にするコンテキスト上限（トークン）。
     * 1M 文脈のモデルではこれを超えることがあるが、その場合も
     * 「文脈を多く積んでいる」事実は変わらないので基準は動かさず、
     * 表示上の割合だけ 100% で頭打ちにする。
     */
    windowTokens: 200_000,
    /** 上限に対する使用率がこれ以下なら満点 */
    perfectBelow: 0.5,
    /** その使用率がこれ以上なら 0 点 */
    zeroAbove: 0.95,
    /** assistant ターンがこれ未満なら判定しない（満点扱い） */
    minTurns: 5,
  },
} as const;
