import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { pct, perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

/** 137283 → "137k" */
function k(tokens: number): string {
  return `${Math.round(tokens / 1000)}k`;
}

export const contextWindowHeadroomRule: Rule = {
  id: "context-window-headroom",
  category: "cost",
  weight: WEIGHTS["context-window-headroom"],
  label: "コンテキストの余裕",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.assistantTurns < THRESHOLDS.contextWindowHeadroom.minTurns) {
      return perfect(
        `assistant ターンが ${m.assistantTurns} 回のため判定対象外です。`,
      );
    }

    const window = THRESHOLDS.contextWindowHeadroom.windowTokens;
    const usage = m.peakContextTokens / window;
    const score = scaleDown(
      usage,
      THRESHOLDS.contextWindowHeadroom.perfectBelow,
      THRESHOLDS.contextWindowHeadroom.zeroAbove,
    );
    // 1M 文脈のモデルでは基準を超えうる。100% を超えた表示は誤解を招くので頭打ちにする。
    const shown = Math.min(usage, 1);

    if (score === 1) {
      return perfect(
        `1 ターンで送られた文脈は最大 ${k(m.peakContextTokens)} トークン（上限の ${pct(shown)}）で、余裕があります。`,
      );
    }

    const evidence =
      `1 ターンで送られた文脈が最大 ${k(m.peakContextTokens)} トークンに達しました` +
      `（上限 ${k(window)} の ${pct(shown)}）。`;

    return {
      score,
      evidence,
      advice:
        "文脈が上限に近づくと、毎ターン大量のトークンを再送することになり、自動圧縮が走れば経緯も失われます。無関係なタスクに移るときは /clear、同じタスクを続けるならタスクの区切りで /compact を実行してください。上限まで待ってから圧縮すると、圧縮自体が高くつきます。広い調査はサブエージェントに任せて結論だけ受け取るのも有効です。",
    };
  },
};
