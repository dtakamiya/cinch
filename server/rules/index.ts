import { cacheEfficiencyRule } from "./cacheEfficiency.js";
import { cacheTtlWasteRule } from "./cacheTtlWaste.js";
import { claudeMdPresentRule } from "./claudeMdPresent.js";
import { contextGrowthRule } from "./contextGrowth.js";
import { modelFitRule } from "./modelFit.js";
import { oversizedToolResultsRule } from "./oversizedToolResults.js";
import { parallelToolUseRule } from "./parallelToolUse.js";
import { redundantFileReadsRule } from "./redundantFileReads.js";
import { subagentDelegationRule } from "./subagentDelegation.js";
import { taskPlanningRule } from "./taskPlanning.js";
import { toolErrorRateRule } from "./toolErrorRate.js";
import { turnEfficiencyRule } from "./turnEfficiency.js";
import type { Rule } from "./types.js";

/**
 * ルールのレジストリ。
 * ルールを追加するときは、rules/ にファイルを 1 つ作ってここに登録し、
 * config/thresholds.ts の WEIGHTS に配点を足す（合計 100 を保つこと）。
 */
export const ALL_RULES: Rule[] = [
  // コスト効率（35）
  cacheEfficiencyRule,
  cacheTtlWasteRule,
  modelFitRule,
  // 生産性（35）
  toolErrorRateRule,
  redundantFileReadsRule,
  parallelToolUseRule,
  turnEfficiencyRule,
  oversizedToolResultsRule,
  // ベストプラクティス（30）
  subagentDelegationRule,
  contextGrowthRule,
  claudeMdPresentRule,
  taskPlanningRule,
];

export type { Rule, RuleResult } from "./types.js";
