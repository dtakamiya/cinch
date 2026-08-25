import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics.js";
import { emptyUsage, type Event, type Usage } from "../shared/types.js";

function asst(
  ts: string,
  opts: {
    model?: string;
    tools?: { id: string; name: string; input?: unknown }[];
    usage?: Partial<Usage>;
    isSidechain?: boolean;
  } = {},
): Event {
  return {
    kind: "assistant",
    ts,
    model: opts.model ?? "claude-sonnet-5",
    effort: null,
    usage: { ...emptyUsage(), ...opts.usage },
    toolUses: (opts.tools ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      input: t.input ?? {},
    })),
    isSidechain: opts.isSidechain ?? false,
  };
}

function usr(
  ts: string,
  results: { id: string; isError?: boolean; bytes?: number }[] = [],
): Event {
  return {
    kind: "user",
    ts,
    toolResults: results.map((r) => ({
      toolUseId: r.id,
      isError: r.isError ?? false,
      byteLength: r.bytes ?? 10,
    })),
  };
}

function meta(cwd: string, version = "2.1.243", gitBranch: string | null = "main"): Event {
  return { kind: "meta", ts: null, cwd, version, gitBranch, permissionMode: null };
}

const base = {
  sessionId: "s1",
  parseErrors: 0,
  hasClaudeMd: false,
  fallbackCwd: "/Users/x/work/cinch",
};

describe("computeMetrics — 基本情報", () => {
  it("セッション ID と入力値をそのまま持つ", () => {
    const m = computeMetrics({
      ...base,
      parseErrors: 4,
      hasClaudeMd: true,
      events: [meta("/Users/x/work/cinch"), asst("2026-08-25T10:00:00.000Z")],
    });
    expect(m.sessionId).toBe("s1");
    expect(m.parseErrors).toBe(4);
    expect(m.hasClaudeMd).toBe(true);
  });

  it("meta 行から cwd / version / gitBranch を取る", () => {
    const m = computeMetrics({
      ...base,
      events: [meta("/Users/x/work/other", "2.0.1", "dev"), asst("2026-08-25T10:00:00.000Z")],
    });
    expect(m.cwd).toBe("/Users/x/work/other");
    expect(m.version).toBe("2.0.1");
    expect(m.gitBranch).toBe("dev");
  });

  it("meta 行が無ければ fallbackCwd を使う", () => {
    const m = computeMetrics({ ...base, events: [asst("2026-08-25T10:00:00.000Z")] });
    expect(m.cwd).toBe("/Users/x/work/cinch");
    expect(m.gitBranch).toBeNull();
    expect(m.version).toBe("");
  });

  it("projectName は cwd の basename", () => {
    const m = computeMetrics({ ...base, events: [meta("/Users/x/work/cc-cost-dash")] });
    expect(m.projectName).toBe("cc-cost-dash");
  });

  it("開始・終了時刻と所要時間を timestamp から算出する", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z"),
        usr("2026-08-25T10:00:30.000Z"),
        asst("2026-08-25T10:02:00.000Z"),
      ],
    });
    expect(m.startedAt).toBe("2026-08-25T10:00:00.000Z");
    expect(m.endedAt).toBe("2026-08-25T10:02:00.000Z");
    expect(m.durationMs).toBe(120_000);
  });

  it("イベントが空でも落ちず 0 値を返す", () => {
    const m = computeMetrics({ ...base, events: [] });
    expect(m.assistantTurns).toBe(0);
    expect(m.durationMs).toBe(0);
    expect(m.startedAt).toBe("");
    expect(m.contextGrowth).toEqual([]);
  });
});

describe("computeMetrics — ターンとモデル", () => {
  it("assistant ターン数を数える（sidechain も含む）", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z"),
        usr("2026-08-25T10:00:01.000Z"),
        asst("2026-08-25T10:00:02.000Z", { isSidechain: true }),
      ],
    });
    expect(m.assistantTurns).toBe(2);
  });

  it("モデルごとのターン数を数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", { model: "claude-opus-5" }),
        asst("2026-08-25T10:00:01.000Z", { model: "claude-opus-5" }),
        asst("2026-08-25T10:00:02.000Z", { model: "claude-sonnet-5" }),
      ],
    });
    expect(m.models).toEqual({ "claude-opus-5": 2, "claude-sonnet-5": 1 });
  });

  it("sidechain のターン数を別に数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z"),
        asst("2026-08-25T10:00:01.000Z", { isSidechain: true }),
        asst("2026-08-25T10:00:02.000Z", { isSidechain: true }),
      ],
    });
    expect(m.sidechainTurns).toBe(2);
  });
});

describe("computeMetrics — トークン集計", () => {
  it("usage をセッション合計に足し込む", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          usage: { input: 10, output: 100, cacheCreate: 500, cacheCreate1h: 500, cacheRead: 0 },
        }),
        asst("2026-08-25T10:00:01.000Z", {
          usage: { input: 5, output: 200, cacheCreate: 0, cacheCreate5m: 0, cacheRead: 500 },
        }),
      ],
    });
    expect(m.totals).toEqual({
      input: 15,
      output: 300,
      cacheCreate: 500,
      cacheCreate1h: 500,
      cacheCreate5m: 0,
      cacheRead: 500,
    });
  });

  it("contextGrowth に各ターンの累積入力トークンを積む", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", { usage: { input: 100, cacheRead: 0 } }),
        asst("2026-08-25T10:00:01.000Z", { usage: { input: 50, cacheRead: 1000 } }),
        asst("2026-08-25T10:00:02.000Z", { usage: { input: 10, cacheRead: 3000 } }),
      ],
    });
    // 各要素はそのターン時点の「入力 + キャッシュ読み込み」= コンテキストの大きさ
    expect(m.contextGrowth).toEqual([100, 1050, 3010]);
  });
});

describe("computeMetrics — ツール呼び出し", () => {
  it("ツール呼び出し数とエラー数を数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [
            { id: "a", name: "Read" },
            { id: "b", name: "Bash" },
          ],
        }),
        usr("2026-08-25T10:00:01.000Z", [
          { id: "a" },
          { id: "b", isError: true },
        ]),
      ],
    });
    expect(m.toolCalls).toBe(2);
    expect(m.toolErrors).toBe(1);
  });

  it("ツール名ごとに呼び出し数とエラー数を集計する", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [
            { id: "a", name: "Bash" },
            { id: "b", name: "Bash" },
            { id: "c", name: "Read" },
          ],
        }),
        usr("2026-08-25T10:00:01.000Z", [
          { id: "a", isError: true },
          { id: "b" },
          { id: "c" },
        ]),
      ],
    });
    expect(m.toolsByName).toEqual({
      Bash: { calls: 2, errors: 1 },
      Read: { calls: 1, errors: 0 },
    });
  });

  it("結果が返ってこないツール呼び出しはエラーに数えない", () => {
    const m = computeMetrics({
      ...base,
      events: [asst("2026-08-25T10:00:00.000Z", { tools: [{ id: "a", name: "Read" }] })],
    });
    expect(m.toolCalls).toBe(1);
    expect(m.toolErrors).toBe(0);
  });
});

describe("computeMetrics — 冗長な再読み込み", () => {
  it("同一ファイルを編集を挟まず 2 回 Read したら 1 回数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [{ id: "a", name: "Read", input: { file_path: "/a.ts" } }],
        }),
        asst("2026-08-25T10:00:01.000Z", {
          tools: [{ id: "b", name: "Read", input: { file_path: "/a.ts" } }],
        }),
      ],
    });
    expect(m.redundantReads).toBe(1);
  });

  it("3 回読めば 2 回数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [
            { id: "a", name: "Read", input: { file_path: "/a.ts" } },
            { id: "b", name: "Read", input: { file_path: "/a.ts" } },
            { id: "c", name: "Read", input: { file_path: "/a.ts" } },
          ],
        }),
      ],
    });
    expect(m.redundantReads).toBe(2);
  });

  it("間に Edit が入れば再読み込みは正当なので数えない", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [{ id: "a", name: "Read", input: { file_path: "/a.ts" } }],
        }),
        asst("2026-08-25T10:00:01.000Z", {
          tools: [{ id: "b", name: "Edit", input: { file_path: "/a.ts" } }],
        }),
        asst("2026-08-25T10:00:02.000Z", {
          tools: [{ id: "c", name: "Read", input: { file_path: "/a.ts" } }],
        }),
      ],
    });
    expect(m.redundantReads).toBe(0);
  });

  it("別ファイルの Edit は再読み込みを正当化しない", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [{ id: "a", name: "Read", input: { file_path: "/a.ts" } }],
        }),
        asst("2026-08-25T10:00:01.000Z", {
          tools: [{ id: "b", name: "Edit", input: { file_path: "/b.ts" } }],
        }),
        asst("2026-08-25T10:00:02.000Z", {
          tools: [{ id: "c", name: "Read", input: { file_path: "/a.ts" } }],
        }),
      ],
    });
    expect(m.redundantReads).toBe(1);
  });

  it("file_path が無い Read は無視する", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [
            { id: "a", name: "Read", input: {} },
            { id: "b", name: "Read", input: {} },
          ],
        }),
      ],
    });
    expect(m.redundantReads).toBe(0);
  });
});

describe("computeMetrics — 並列化の機会", () => {
  it("読み取り専用ツールを 1 件ずつ 3 ターン続けたら機会 3・逐次 3", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", { tools: [{ id: "a", name: "Read", input: { file_path: "/a.ts" } }] }),
        usr("2026-08-25T10:00:01.000Z", [{ id: "a" }]),
        asst("2026-08-25T10:00:02.000Z", { tools: [{ id: "b", name: "Read", input: { file_path: "/b.ts" } }] }),
        usr("2026-08-25T10:00:03.000Z", [{ id: "b" }]),
        asst("2026-08-25T10:00:04.000Z", { tools: [{ id: "c", name: "Grep", input: {} }] }),
        usr("2026-08-25T10:00:05.000Z", [{ id: "c" }]),
      ],
    });
    expect(m.parallelizableOpportunities).toBe(3);
    expect(m.parallelizableSequences).toBe(3);
  });

  it("1 ターンにまとめれば機会 1・逐次 0", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [
            { id: "a", name: "Read", input: { file_path: "/a.ts" } },
            { id: "b", name: "Read", input: { file_path: "/b.ts" } },
            { id: "c", name: "Grep", input: {} },
          ],
        }),
        usr("2026-08-25T10:00:01.000Z", [{ id: "a" }, { id: "b" }, { id: "c" }]),
      ],
    });
    expect(m.parallelizableOpportunities).toBe(1);
    expect(m.parallelizableSequences).toBe(0);
  });

  it("書き込み系ツールは独立と判定できないので機会に数えない", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", { tools: [{ id: "a", name: "Edit", input: { file_path: "/a.ts" } }] }),
        usr("2026-08-25T10:00:01.000Z", [{ id: "a" }]),
        asst("2026-08-25T10:00:02.000Z", { tools: [{ id: "b", name: "Edit", input: { file_path: "/b.ts" } }] }),
        usr("2026-08-25T10:00:03.000Z", [{ id: "b" }]),
      ],
    });
    expect(m.parallelizableOpportunities).toBe(0);
    expect(m.parallelizableSequences).toBe(0);
  });

  it("読み取りと書き込みが混ざるターンは機会に数えない", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [
            { id: "a", name: "Read", input: { file_path: "/a.ts" } },
            { id: "b", name: "Edit", input: { file_path: "/b.ts" } },
          ],
        }),
      ],
    });
    expect(m.parallelizableOpportunities).toBe(0);
  });
});

describe("computeMetrics — 探索の重さとモデル適合", () => {
  it("読み取り専用ツールを 3 件以上呼んだターンを heavy と数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [
            { id: "a", name: "Read", input: { file_path: "/a.ts" } },
            { id: "b", name: "Grep", input: {} },
            { id: "c", name: "Glob", input: {} },
          ],
        }),
        asst("2026-08-25T10:00:01.000Z", {
          tools: [{ id: "d", name: "Read", input: { file_path: "/b.ts" } }],
        }),
      ],
    });
    expect(m.heavyExplorationTurns).toBe(1);
  });

  it("単純作業ターンと、それを高コストモデルでやった数を分けて数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        // 単純作業（Read のみ）を opus で
        asst("2026-08-25T10:00:00.000Z", {
          model: "claude-opus-5",
          tools: [{ id: "a", name: "Read", input: { file_path: "/a.ts" } }],
        }),
        // 単純作業を sonnet で
        asst("2026-08-25T10:00:01.000Z", {
          model: "claude-sonnet-5",
          tools: [{ id: "b", name: "Grep", input: {} }],
        }),
        // Edit を含むので単純作業ではない
        asst("2026-08-25T10:00:02.000Z", {
          model: "claude-opus-5",
          tools: [{ id: "c", name: "Edit", input: { file_path: "/a.ts" } }],
        }),
        // ツール呼び出しの無いターンは単純作業に数えない
        asst("2026-08-25T10:00:03.000Z", { model: "claude-opus-5" }),
      ],
    });
    expect(m.simpleWorkTurns).toBe(2);
    expect(m.simpleWorkOnExpensiveModel).toBe(1);
  });
});

describe("computeMetrics — キャッシュ失効", () => {
  it("1h キャッシュ作成のうち、後続で読まれなかった回数を数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        // 1h 作成、直後のターンで読まれている → 失効ではない
        asst("2026-08-25T10:00:00.000Z", { usage: { cacheCreate1h: 1000, cacheRead: 0 } }),
        asst("2026-08-25T10:05:00.000Z", { usage: { cacheCreate1h: 0, cacheRead: 1000 } }),
        // 1h 作成したが、これ以降 cacheRead が発生しない → 失効
        asst("2026-08-25T10:10:00.000Z", { usage: { cacheCreate1h: 2000, cacheRead: 1000 } }),
      ],
    });
    expect(m.cache1hCreations).toBe(2);
    expect(m.cacheExpirations).toBe(1);
  });

  it("1h キャッシュ作成が無ければ失効も 0", () => {
    const m = computeMetrics({
      ...base,
      events: [asst("2026-08-25T10:00:00.000Z", { usage: { cacheCreate5m: 500 } })],
    });
    expect(m.cache1hCreations).toBe(0);
    expect(m.cacheExpirations).toBe(0);
  });

  it("作成から 1 時間を超えて初めて読まれた場合は失効として数える", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", { usage: { cacheCreate1h: 1000, cacheRead: 0 } }),
        asst("2026-08-25T11:30:00.000Z", { usage: { cacheRead: 1000 } }),
      ],
    });
    expect(m.cacheExpirations).toBe(1);
  });
});
