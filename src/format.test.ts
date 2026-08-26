import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  RULE_LABELS,
  formatDateTime,
  formatDuration,
  formatScore,
  scoreBar,
} from "./format.js";

describe("formatDateTime", () => {
  it("月/日 時:分 の形式にする", () => {
    // ローカルタイムゾーンに依存しないよう、結果の形だけを検証する
    expect(formatDateTime("2026-08-25T14:03:00.000Z")).toMatch(
      /^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/,
    );
  });

  it("空文字なら — を返す", () => {
    expect(formatDateTime("")).toBe("—");
  });

  it("解釈できない文字列なら — を返す", () => {
    expect(formatDateTime("not a date")).toBe("—");
  });
});

describe("formatDuration", () => {
  it("1 分未満は秒で表す", () => {
    expect(formatDuration(45_000)).toBe("45秒");
  });

  it("1 時間未満は分で表す", () => {
    expect(formatDuration(12 * 60_000)).toBe("12分");
  });

  it("1 時間以上は時間と分で表す", () => {
    expect(formatDuration(63 * 60_000)).toBe("1時間3分");
  });

  it("ちょうど 2 時間なら分を省く", () => {
    expect(formatDuration(120 * 60_000)).toBe("2時間");
  });

  it("0 なら 0秒", () => {
    expect(formatDuration(0)).toBe("0秒");
  });
});

describe("formatScore", () => {
  it("整数ならそのまま", () => {
    expect(formatScore(71)).toBe("71");
  });

  it("小数は第 1 位まで", () => {
    expect(formatScore(71.25)).toBe("71.3");
  });
});

describe("scoreBar", () => {
  it("3 文字を返す", () => {
    expect(scoreBar(0)).toHaveLength(3);
    expect(scoreBar(50)).toHaveLength(3);
    expect(scoreBar(100)).toHaveLength(3);
  });

  it("スコアが高いほど濃いブロックになる", () => {
    expect(scoreBar(100)).toBe("███");
    expect(scoreBar(0)).toBe("▁▁▁");
  });
});

describe("RULE_LABELS", () => {
  it("10 ルール分の日本語名を持つ", () => {
    expect(Object.keys(RULE_LABELS)).toHaveLength(10);
  });

  it("すべてのルール ID をカバーしている", () => {
    const ids = [
      "cache-efficiency",
      "cache-ttl-waste",
      "model-fit",
      "tool-error-rate",
      "redundant-file-reads",
      "parallel-tool-use",
      "turn-efficiency",
      "subagent-delegation",
      "context-growth",
      "claude-md-present",
    ];
    for (const id of ids) {
      expect(RULE_LABELS[id]).toBeTruthy();
    }
  });
});

describe("CATEGORY_LABELS", () => {
  it("3 カテゴリの日本語名を持つ", () => {
    expect(CATEGORY_LABELS.cost).toBe("コスト効率");
    expect(CATEGORY_LABELS.productivity).toBe("生産性");
    expect(CATEGORY_LABELS.practice).toBe("ベストプラクティス");
  });
});
