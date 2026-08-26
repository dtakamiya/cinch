import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeAll, analyzeFile, toSummary } from "./analyze.js";
import { AnalysisCache } from "./cache.js";
import { discoverSessions } from "./discover.js";

let root = "";
let projectCwd = "";

/** assistant / user が交互に並ぶ最小のセッションログを作る */
function sessionLines(cwd: string, turns: number): string {
  const lines: string[] = [
    JSON.stringify({
      type: "system",
      timestamp: new Date(Date.UTC(2026, 7, 25, 10, 0)).toISOString(),
      cwd,
      version: "2.1.243",
      gitBranch: "main",
      subtype: "turn_summary",
    }),
  ];
  for (let i = 0; i < turns; i++) {
    lines.push(
      JSON.stringify({
        type: "assistant",
        timestamp: new Date(Date.UTC(2026, 7, 25, 10, i)).toISOString(),
        cwd,
        version: "2.1.243",
        gitBranch: "main",
        isSidechain: false,
        message: {
          model: "claude-sonnet-5",
          usage: {
            input_tokens: 10,
            output_tokens: 500,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 5000,
          },
          content: [
            { type: "tool_use", id: `tu_${i}`, name: "Read", input: { file_path: `/f${i}.ts` } },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        timestamp: new Date(Date.UTC(2026, 7, 25, 10, i, 30)).toISOString(),
        cwd,
        message: {
          content: [{ type: "tool_result", tool_use_id: `tu_${i}`, content: "ok" }],
        },
      }),
    );
  }
  return lines.join("\n") + "\n";
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cinch-analyze-"));
  projectCwd = await mkdtemp(join(tmpdir(), "cinch-cwd-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(projectCwd, { recursive: true, force: true });
});

async function writeSession(name: string, content: string): Promise<void> {
  const proj = join(root, "-tmp-proj");
  await mkdir(proj, { recursive: true });
  await writeFile(join(proj, `${name}.jsonl`), content);
}

describe("analyzeFile", () => {
  it("ログを解析して metrics と score を返す", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const { files } = await discoverSessions(root);
    const file = files[0];
    if (file === undefined) throw new Error("no file discovered");

    const result = await analyzeFile(file);
    expect(result.metrics.sessionId).toBe("s1");
    expect(result.metrics.assistantTurns).toBe(5);
    expect(result.metrics.toolCalls).toBe(5);
    expect(result.metrics.cwd).toBe(projectCwd);
    expect(result.score.gradable).toBe(true);
    expect(result.score.total).toBeGreaterThan(0);
  });

  it("パース不能な行を parseErrors に数え、セッションは破棄しない", async () => {
    const good = sessionLines(projectCwd, 5);
    await writeSession("s1", good + "{broken json\nnot json at all\n");
    const { files } = await discoverSessions(root);
    const file = files[0];
    if (file === undefined) throw new Error("no file discovered");

    const result = await analyzeFile(file);
    expect(result.metrics.parseErrors).toBe(2);
    expect(result.metrics.assistantTurns).toBe(5);
  });

  it("未知の type は parseErrors に数えない（前方互換）", async () => {
    await writeSession(
      "s1",
      sessionLines(projectCwd, 5) + '{"type":"file-history-delta","messageId":"x"}\n',
    );
    const { files } = await discoverSessions(root);
    const file = files[0];
    if (file === undefined) throw new Error("no file discovered");

    const result = await analyzeFile(file);
    expect(result.metrics.parseErrors).toBe(0);
  });

  it("cwd に CLAUDE.md があれば hasClaudeMd: true", async () => {
    await writeFile(join(projectCwd, "CLAUDE.md"), "# rules");
    await writeSession("s1", sessionLines(projectCwd, 5));
    const { files } = await discoverSessions(root);
    const file = files[0];
    if (file === undefined) throw new Error("no file discovered");

    expect((await analyzeFile(file)).metrics.hasClaudeMd).toBe(true);
  });

  it("ターン数が 3 未満なら gradable: false", async () => {
    await writeSession("s1", sessionLines(projectCwd, 2));
    const { files } = await discoverSessions(root);
    const file = files[0];
    if (file === undefined) throw new Error("no file discovered");

    expect((await analyzeFile(file)).score.gradable).toBe(false);
  });
});

describe("toSummary", () => {
  it("evidence / advice を含まない要約に変換する", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const { files } = await discoverSessions(root);
    const file = files[0];
    if (file === undefined) throw new Error("no file discovered");

    const summary = toSummary(await analyzeFile(file));
    expect(summary.sessionId).toBe("s1");
    expect(summary.assistantTurns).toBe(5);
    expect(Object.keys(summary)).not.toContain("rules");
    expect(JSON.stringify(summary)).not.toContain("advice");
  });

  it("最大減点ルールを topDeduction に入れる", async () => {
    // parallel-tool-use が満点になるよう、読み取り専用ツールを 1 ターンにまとめて呼ぶ
    // （逐次実行にしないことで、CLAUDE.md 不在の減点だけが最大になるようにする）
    const lines: string[] = [
      JSON.stringify({
        type: "system",
        timestamp: new Date(Date.UTC(2026, 7, 25, 10, 0)).toISOString(),
        cwd: projectCwd,
        version: "2.1.243",
        gitBranch: "main",
        subtype: "turn_summary",
      }),
    ];
    for (let i = 0; i < 5; i++) {
      lines.push(
        JSON.stringify({
          type: "assistant",
          timestamp: new Date(Date.UTC(2026, 7, 25, 10, i)).toISOString(),
          cwd: projectCwd,
          version: "2.1.243",
          gitBranch: "main",
          isSidechain: false,
          message: {
            model: "claude-sonnet-5",
            usage: {
              input_tokens: 10,
              output_tokens: 500,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 5000,
            },
            content: [
              { type: "tool_use", id: `tu_${i}a`, name: "Read", input: { file_path: `/a${i}.ts` } },
              { type: "tool_use", id: `tu_${i}b`, name: "Read", input: { file_path: `/b${i}.ts` } },
            ],
          },
        }),
        JSON.stringify({
          type: "user",
          timestamp: new Date(Date.UTC(2026, 7, 25, 10, i, 30)).toISOString(),
          cwd: projectCwd,
          message: {
            content: [
              { type: "tool_result", tool_use_id: `tu_${i}a`, content: "ok" },
              { type: "tool_result", tool_use_id: `tu_${i}b`, content: "ok" },
            ],
          },
        }),
      );
    }
    await writeSession("s1", lines.join("\n") + "\n");
    const { files } = await discoverSessions(root);
    const file = files[0];
    if (file === undefined) throw new Error("no file discovered");

    const summary = toSummary(await analyzeFile(file));
    // CLAUDE.md が無いので claude-md-present が減点されるはず
    expect(summary.topDeduction?.id).toBe("claude-md-present");
  });
});

describe("analyzeAll", () => {
  it("全セッションを解析して返す", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    await writeSession("s2", sessionLines(projectCwd, 4));

    const result = await analyzeAll(root);
    expect(result.sessions).toHaveLength(2);
    expect(result.projectCount).toBe(1);
    expect(result.rootExists).toBe(true);
  });

  it("root が無くても例外を投げず rootExists: false を返す", async () => {
    const result = await analyzeAll(join(root, "nope"));
    expect(result.rootExists).toBe(false);
    expect(result.sessions).toEqual([]);
  });

  it("キャッシュを渡すと 2 回目は同一オブジェクトを返す", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const cache = new AnalysisCache();

    const first = await analyzeAll(root, cache);
    const second = await analyzeAll(root, cache);
    expect(second.sessions[0]).toBe(first.sessions[0]);
    expect(cache.size()).toBe(1);
  });

  it("mtime が変われば再解析する", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const cache = new AnalysisCache();
    const first = await analyzeAll(root, cache);

    await writeSession("s1", sessionLines(projectCwd, 8));
    const second = await analyzeAll(root, cache);

    expect(second.sessions[0]).not.toBe(first.sessions[0]);
    expect(second.sessions[0]?.metrics.assistantTurns).toBe(8);
  });

  it("読めないファイルは skipped に入れ、他のセッションは解析する", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const proj = join(root, "-tmp-proj");
    await writeFile(join(proj, "empty.jsonl"), "");

    const result = await analyzeAll(root);
    expect(result.sessions).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });
});
