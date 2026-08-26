import { describe, expect, it } from "vitest";
import { computeScore, topDeduction } from "./score.js";
import { ALL_RULES } from "./rules/index.js";
import { metricsFixture } from "./rules/testHelpers.js";
import type { Rule } from "./rules/types.js";

/** 固定スコアを返すダミールール */
function fakeRule(
  id: string,
  category: "cost" | "productivity" | "practice",
  weight: number,
  score: number,
): Rule {
  return {
    id: id as Rule["id"],
    category,
    weight,
    label: id,
    evaluate: () => ({
      score,
      evidence: `${id} の根拠`,
      advice: score === 1 ? null : `${id} の改善案`,
    }),
  };
}

describe("computeScore — 合算", () => {
  it("全ルール満点なら 100 点", () => {
    const rules = [
      fakeRule("a", "cost", 35, 1),
      fakeRule("b", "productivity", 35, 1),
      fakeRule("c", "practice", 30, 1),
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.total).toBe(100);
  });

  it("全ルール 0 点なら 0 点", () => {
    const rules = [
      fakeRule("a", "cost", 35, 0),
      fakeRule("b", "productivity", 35, 0),
      fakeRule("c", "practice", 30, 0),
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.total).toBe(0);
  });

  it("weight × score を合算し、小数第 1 位に丸める", () => {
    const rules = [
      fakeRule("a", "cost", 15, 0.5), // 7.5
      fakeRule("b", "productivity", 12, 0.25), // 3
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.total).toBe(10.5);
  });

  it("カテゴリごとの earned / max を算出する", () => {
    const rules = [
      fakeRule("a", "cost", 15, 1),
      fakeRule("b", "cost", 10, 0),
      fakeRule("c", "productivity", 12, 0.5),
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.categories.cost).toEqual({ earned: 15, max: 25 });
    expect(s.categories.productivity).toEqual({ earned: 6, max: 12 });
  });

  it("該当ルールの無いカテゴリも 0 / 0 で存在する", () => {
    const rules = [fakeRule("a", "cost", 15, 1)];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.categories.practice).toEqual({ earned: 0, max: 0 });
  });

  it("カテゴリ小計の合計が total と一致する", () => {
    const s = computeScore(metricsFixture({ assistantTurns: 10, toolCalls: 50, toolErrors: 10 }));
    const sum =
      s.categories.cost.earned +
      s.categories.productivity.earned +
      s.categories.practice.earned;
    expect(Math.round(sum * 10) / 10).toBe(s.total);
  });
});

describe("computeScore — EvaluatedRule", () => {
  it("各ルールの earned / max / evidence / advice を持つ", () => {
    const rules = [fakeRule("a", "cost", 15, 0.4)];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.rules).toEqual([
      {
        id: "a",
        category: "cost",
        earned: 6,
        max: 15,
        evidence: "a の根拠",
        advice: "a の改善案",
      },
    ]);
  });

  it("減点の大きいルールから順に並べる", () => {
    const rules = [
      fakeRule("small", "cost", 10, 0.9), // 減点 1
      fakeRule("big", "productivity", 12, 0), // 減点 12
      fakeRule("mid", "practice", 8, 0.5), // 減点 4
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.rules.map((r) => r.id)).toEqual(["big", "mid", "small"]);
  });
});

describe("computeScore — gradable", () => {
  it("assistant ターンが 3 未満なら gradable: false で total 0", () => {
    const s = computeScore(metricsFixture({ assistantTurns: 2 }));
    expect(s.gradable).toBe(false);
    expect(s.total).toBe(0);
    expect(s.rules).toEqual([]);
  });

  it("assistant ターンが 3（閾値ちょうど）なら gradable: true", () => {
    const s = computeScore(metricsFixture({ assistantTurns: 3 }));
    expect(s.gradable).toBe(true);
    expect(s.rules.length).toBe(ALL_RULES.length);
  });
});

describe("computeScore — 実ルールでの整合性", () => {
  it("配点の max 合計が 100 である", () => {
    const s = computeScore(metricsFixture({ assistantTurns: 10 }));
    const max =
      s.categories.cost.max +
      s.categories.productivity.max +
      s.categories.practice.max;
    expect(max).toBe(100);
  });

  it("カテゴリの max が 35 / 35 / 30 である", () => {
    const s = computeScore(metricsFixture({ assistantTurns: 10 }));
    expect(s.categories.cost.max).toBe(35);
    expect(s.categories.productivity.max).toBe(35);
    expect(s.categories.practice.max).toBe(30);
  });

  it("total が 0〜100 に収まる", () => {
    const s = computeScore(
      metricsFixture({
        assistantTurns: 20,
        toolCalls: 100,
        toolErrors: 50,
        redundantReads: 20,
        hasClaudeMd: false,
      }),
    );
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });

  it("sessionId を引き継ぐ", () => {
    const s = computeScore(metricsFixture({ sessionId: "abc", assistantTurns: 10 }));
    expect(s.sessionId).toBe("abc");
  });
});

describe("computeScore — 丸めの境界", () => {
  it("earned は個別に小数第 1 位へ丸める（0.05 は切り上げ方向）", () => {
    // weight 1 × score 0.05 = 0.05 → round1 で 0.1
    const rules = [fakeRule("a", "cost", 1, 0.05)];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.rules[0]?.earned).toBe(0.1);
  });

  it("0.05 未満は 0 に丸める", () => {
    // weight 1 × score 0.04 = 0.04 → round1 で 0
    const rules = [fakeRule("a", "cost", 1, 0.04)];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.rules[0]?.earned).toBe(0);
  });

  it("individual earned を丸めてから合算する（丸め誤差が total に乗りうることの明示）", () => {
    // 各 0.04 は earned 0 に丸められるので total も 0。
    // 丸めずに合算していれば 0.12 になるはずの入力。
    const rules = [
      fakeRule("a", "cost", 1, 0.04),
      fakeRule("b", "productivity", 1, 0.04),
      fakeRule("c", "practice", 1, 0.04),
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.total).toBe(0);
    expect(s.categories.cost.earned).toBe(0);
  });

  it("カテゴリ earned も逐次丸めるが total と一致する", () => {
    const rules = [
      fakeRule("a", "cost", 3, 0.5), // 1.5
      fakeRule("b", "cost", 3, 0.5), // 1.5
      fakeRule("c", "productivity", 7, 0.5), // 3.5
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.categories.cost.earned).toBe(3);
    expect(s.categories.productivity.earned).toBe(3.5);
    expect(s.total).toBe(6.5);
  });
});

describe("computeScore — ソートの安定性", () => {
  it("減点が同幅のルールは入力順を保つ", () => {
    const rules = [
      fakeRule("first", "cost", 10, 0.5), // 減点 5
      fakeRule("second", "productivity", 10, 0.5), // 減点 5
      fakeRule("third", "practice", 10, 0.5), // 減点 5
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.rules.map((r) => r.id)).toEqual(["first", "second", "third"]);
  });

  it("満点ルールは減点ありルールより後ろに並ぶ", () => {
    const rules = [
      fakeRule("perfect", "cost", 10, 1), // 減点 0
      fakeRule("deducted", "productivity", 5, 0.5), // 減点 2.5
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(s.rules.map((r) => r.id)).toEqual(["deducted", "perfect"]);
  });

  // 不変条件（cinch-015）: computeScore の返り値 rules は失点降順でソート済みであること。
  // UI（SessionList / SessionDetail / deduction.ts）が rules[0] を「最大の失点」として
  // 直接参照しているため、score.ts:65 のソート行が壊れたらここで気付けるようにする。
  it("rules は失点（max - earned）の降順に並ぶ", () => {
    // 失点がばらける入力（入力順はわざと降順にしない）
    const rules = [
      fakeRule("lose3", "cost", 10, 0.7), // 減点 3
      fakeRule("lose9", "productivity", 12, 0.25), // 減点 9
      fakeRule("lose0", "practice", 8, 1), // 減点 0
      fakeRule("lose6", "cost", 10, 0.4), // 減点 6
      fakeRule("lose1", "productivity", 10, 0.9), // 減点 1
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);

    const lost = s.rules.map((r) => Math.round((r.max - r.earned) * 10) / 10);
    expect(lost).toEqual([9, 6, 3, 1, 0]);
    // 隣接ペアが常に lost[i] >= lost[i+1]（不変条件そのもの）
    for (let i = 0; i < lost.length - 1; i++) {
      expect(lost[i]!).toBeGreaterThanOrEqual(lost[i + 1]!);
    }
    // rules[0] が最大の失点であること（UI が依存している性質）
    expect(s.rules[0]!.id).toBe("lose9");
  });
});

describe("topDeduction", () => {
  it("最も減点の大きいルール ID と減点幅を返す", () => {
    const rules = [
      fakeRule("small", "cost", 10, 0.9),
      fakeRule("big", "productivity", 12, 0),
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(topDeduction(s)).toEqual({ id: "big", lost: 12 });
  });

  it("全ルール満点なら null を返す", () => {
    const rules = [fakeRule("a", "cost", 10, 1)];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(topDeduction(s)).toBeNull();
  });

  it("gradable: false なら null を返す", () => {
    const s = computeScore(metricsFixture({ assistantTurns: 1 }));
    expect(topDeduction(s)).toBeNull();
  });

  it("減点幅が同じなら、並び順で先に来るルールを返す", () => {
    const rules = [
      fakeRule("a", "cost", 10, 0.5), // 減点 5
      fakeRule("b", "productivity", 10, 0.5), // 減点 5（同幅）
    ];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    // ソート後も同幅なら入力順が保たれ、先頭が選ばれる
    expect(topDeduction(s)).toEqual({ id: "a", lost: 5 });
  });

  it("丸めで earned が max と同値になり lost が 0 以下なら null を返す", () => {
    // 1 × 0.96 = 0.96 → round1 で earned 1.0 → lost = 1.0 - 1.0 = 0
    const rules = [fakeRule("a", "cost", 1, 0.96)];
    const s = computeScore(metricsFixture({ assistantTurns: 10 }), rules);
    expect(topDeduction(s)).toBeNull();
  });
});
