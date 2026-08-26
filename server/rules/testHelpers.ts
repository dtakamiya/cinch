import { emptyUsage, type SessionMetrics, type Usage } from "../../shared/types.js";

/** 全フィールドを 0 埋めした SessionMetrics に、テストが関心を持つ値だけ被せる */
export function metricsFixture(
  overrides: Partial<Omit<SessionMetrics, "totals">> & {
    totals?: Partial<Usage>;
  } = {},
): SessionMetrics {
  const { totals, ...rest } = overrides;
  return {
    sessionId: "s1",
    cwd: "/Users/x/work/cinch",
    projectName: "cinch",
    startedAt: "2026-08-25T10:00:00.000Z",
    endedAt: "2026-08-25T10:30:00.000Z",
    durationMs: 1_800_000,
    assistantTurns: 10,
    models: { "claude-sonnet-5": 10 },
    toolCalls: 0,
    toolErrors: 0,
    toolsByName: {},
    redundantReads: 0,
    parallelizableSequences: 0,
    parallelizableOpportunities: 0,
    sidechainTurns: 0,
    heavyExplorationTurns: 0,
    simpleWorkTurns: 0,
    simpleWorkOnExpensiveModel: 0,
    contextGrowth: [],
    cacheExpirations: 0,
    cache1hCreations: 0,
    hasClaudeMd: true,
    gitBranch: "main",
    version: "2.1.243",
    oversizedResults: 0,
    largestResultBytes: 0,
    largestResultTool: null,
    editCalls: 0,
    verificationCalls: 0,
    bashInsteadOfTool: 0,
    bashInsteadOfToolByCommand: {},
    peakContextTokens: 0,
    parseErrors: 0,
    ...rest,
    totals: { ...emptyUsage(), ...totals },
  };
}
