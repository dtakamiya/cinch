import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "./api.js";

let root = "";
let projectCwd = "";

function sessionLines(cwd: string, turns: number, model = "claude-sonnet-5"): string {
  const lines: string[] = [
    JSON.stringify({
      type: "system",
      subtype: "init",
      timestamp: new Date(Date.UTC(2026, 7, 25, 9, 59, 59)).toISOString(),
      cwd,
      version: "2.1.243",
      gitBranch: "main",
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
          model,
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

async function writeSession(name: string, content: string): Promise<void> {
  const proj = join(root, "-tmp-proj");
  await mkdir(proj, { recursive: true });
  await writeFile(join(proj, `${name}.jsonl`), content);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cinch-api-"));
  projectCwd = await mkdtemp(join(tmpdir(), "cinch-api-cwd-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(projectCwd, { recursive: true, force: true });
});

describe("GET /api/sessions", () => {
  it("200 と応答スキーマを返す", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const res = await request(createApp({ root })).get("/api/sessions");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(typeof res.body.scannedAt).toBe("string");
    expect(typeof res.body.projectCount).toBe("number");
    expect(Array.isArray(res.body.skipped)).toBe(true);
  });

  it("SessionSummary の各フィールドを含む", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const res = await request(createApp({ root })).get("/api/sessions");
    const s = res.body.sessions[0];

    expect(s.sessionId).toBe("s1");
    expect(s.projectName).toBe(projectCwd.split("/").pop());
    expect(typeof s.startedAt).toBe("string");
    expect(typeof s.durationMs).toBe("number");
    expect(s.assistantTurns).toBe(5);
    expect(typeof s.total).toBe("number");
    expect(s.gradable).toBe(true);
    expect(s.categories.cost.max).toBe(35);
  });

  it("一覧の応答に evidence / advice を含めない", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const res = await request(createApp({ root })).get("/api/sessions");
    const body = JSON.stringify(res.body);

    expect(body).not.toContain("advice");
    expect(body).not.toContain("evidence");
  });

  it("応答に会話の本文を含めない", async () => {
    const secret = "SUPER_SECRET_PROMPT_TEXT";
    const withText = JSON.stringify({
      type: "user",
      timestamp: "2026-08-25T10:00:00.000Z",
      cwd: projectCwd,
      message: { content: secret },
    });
    await writeSession("s1", sessionLines(projectCwd, 5) + withText + "\n");

    const res = await request(createApp({ root })).get("/api/sessions");
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it("スコアの高い順に並べる", async () => {
    // CLAUDE.md がある方が高得点になる
    await writeFile(join(projectCwd, "CLAUDE.md"), "# rules");
    await writeSession("high", sessionLines(projectCwd, 5));

    const other = await mkdtemp(join(tmpdir(), "cinch-api-low-"));
    const proj = join(root, "-tmp-proj2");
    await mkdir(proj, { recursive: true });
    await writeFile(join(proj, "low.jsonl"), sessionLines(other, 5));

    const res = await request(createApp({ root })).get("/api/sessions");
    const totals = res.body.sessions.map((s: { total: number }) => s.total);
    expect(totals[0]).toBeGreaterThanOrEqual(totals[1]);

    await rm(other, { recursive: true, force: true });
  });

  it("root が存在しなくても 200 と説明メッセージを返す", async () => {
    const res = await request(createApp({ root: join(root, "nope") })).get("/api/sessions");

    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.projectCount).toBe(0);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("読めないファイルを skipped に理由付きで含める", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const proj = join(root, "-tmp-proj");
    await writeFile(join(proj, "empty.jsonl"), "");

    const res = await request(createApp({ root })).get("/api/sessions");
    expect(res.body.skipped).toHaveLength(1);
    expect(typeof res.body.skipped[0].path).toBe("string");
    expect(typeof res.body.skipped[0].reason).toBe("string");
  });

  it("採点対象外のセッションも一覧に含める（gradable: false）", async () => {
    await writeSession("short", sessionLines(projectCwd, 2));
    const res = await request(createApp({ root })).get("/api/sessions");

    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].gradable).toBe(false);
  });
});

describe("GET /api/sessions/:sessionId", () => {
  it("200 で metrics と score を返す", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const res = await request(createApp({ root })).get("/api/sessions/s1");

    expect(res.status).toBe(200);
    expect(res.body.metrics.sessionId).toBe("s1");
    expect(res.body.metrics.assistantTurns).toBe(5);
    expect(res.body.score.gradable).toBe(true);
  });

  it("rules を全量（evidence / advice 込み）で返す", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const res = await request(createApp({ root })).get("/api/sessions/s1");

    expect(res.body.score.rules).toHaveLength(15);
    for (const rule of res.body.score.rules) {
      expect(typeof rule.id).toBe("string");
      expect(typeof rule.evidence).toBe("string");
      expect(typeof rule.earned).toBe("number");
      expect(typeof rule.max).toBe("number");
    }
  });

  it("存在しない sessionId なら 404 とエラーメッセージ", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const res = await request(createApp({ root })).get("/api/sessions/nope");

    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe("string");
  });

  it("パストラバーサルを試みる sessionId でも 404 で安全に返す", async () => {
    await writeSession("s1", sessionLines(projectCwd, 5));
    const res = await request(createApp({ root })).get(
      "/api/sessions/..%2F..%2Fetc%2Fpasswd",
    );

    expect(res.status).toBe(404);
  });

  it("詳細でも会話の本文を返さない", async () => {
    const secret = "ANOTHER_SECRET_TEXT";
    const withText = JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-25T10:30:00.000Z",
      cwd: projectCwd,
      message: {
        model: "claude-sonnet-5",
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: "text", text: secret }],
      },
    });
    await writeSession("s1", sessionLines(projectCwd, 5) + withText + "\n");

    const res = await request(createApp({ root })).get("/api/sessions/s1");
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });
});
