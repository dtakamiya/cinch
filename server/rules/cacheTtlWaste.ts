import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { pct, perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

export const cacheTtlWasteRule: Rule = {
  id: "cache-ttl-waste",
  category: "cost",
  weight: WEIGHTS["cache-ttl-waste"],
  label: "キャッシュ TTL の無駄",
  evaluate(m: SessionMetrics): RuleResult {
    const created = m.cache1hCreations;
    if (created < THRESHOLDS.cacheTtlWaste.minCreations) {
      return perfect(
        `1h キャッシュの作成が ${created} 回のため判定対象外です。`,
      );
    }

    const wasteRate = m.cacheExpirations / created;
    const score = scaleDown(
      wasteRate,
      THRESHOLDS.cacheTtlWaste.perfectBelow,
      THRESHOLDS.cacheTtlWaste.zeroAbove,
    );
    const evidence = `1h キャッシュ作成 ${created} 回のうち ${m.cacheExpirations} 回が再利用されずに失効（${pct(wasteRate)}）。`;

    if (score === 1) return perfect(evidence);
    return {
      score,
      evidence,
      advice:
        "1h キャッシュは 5m 比で作成コストが割高です。作ったあと 1 時間以内に再利用できていないなら、長時間の中断を挟む使い方に対して TTL が長すぎます。作業をまとめて一気に進めるか、短い作業では 1h キャッシュを使わない設定を検討してください。",
    };
  },
};
