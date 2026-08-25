import { describe, expect, it } from "vitest";
import { parseLine } from "./parse.js";

describe("parseLine", () => {
  it("JSON として不正な行は null を返す", () => {
    expect(parseLine("{not json")).toBeNull();
    expect(parseLine("")).toBeNull();
    expect(parseLine("   ")).toBeNull();
  });

  it("配列や文字列などオブジェクトでない JSON は null を返す", () => {
    expect(parseLine("[1,2,3]")).toBeNull();
    expect(parseLine('"hello"')).toBeNull();
    expect(parseLine("null")).toBeNull();
  });

  it("未知の type は null を返す（前方互換）", () => {
    expect(parseLine('{"type":"atis-latch","sessionId":"s1"}')).toBeNull();
    expect(parseLine('{"type":"file-history-delta"}')).toBeNull();
    expect(parseLine('{"type":"brand-new-event-type-2027"}')).toBeNull();
  });

  it("assistant 行を usage を平坦化して正規化する", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-25T10:00:00.000Z",
      isSidechain: false,
      effort: "medium",
      cwd: "/Users/x/work/cinch",
      version: "2.1.243",
      gitBranch: "main",
      message: {
        role: "assistant",
        model: "claude-opus-5",
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 45043,
          cache_read_input_tokens: 1200,
          output_tokens: 157,
          cache_creation: {
            ephemeral_1h_input_tokens: 45043,
            ephemeral_5m_input_tokens: 0,
          },
        },
        content: [
          { type: "text", text: "作業します" },
          { type: "tool_use", id: "tu_1", name: "Read", input: { file_path: "/a.ts" } },
        ],
      },
    });
    expect(parseLine(line)).toEqual({
      kind: "assistant",
      ts: "2026-08-25T10:00:00.000Z",
      model: "claude-opus-5",
      effort: "medium",
      usage: {
        input: 2,
        output: 157,
        cacheCreate: 45043,
        cacheCreate1h: 45043,
        cacheCreate5m: 0,
        cacheRead: 1200,
      },
      toolUses: [{ id: "tu_1", name: "Read", input: { file_path: "/a.ts" } }],
      isSidechain: false,
    });
  });

  it("cache_creation が欠けていても 1h/5m を 0 にして落ちない", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-25T10:00:00.000Z",
      message: {
        model: "claude-sonnet-5",
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 0,
          output_tokens: 20,
        },
        content: [],
      },
    });
    const ev = parseLine(line);
    expect(ev?.kind).toBe("assistant");
    if (ev?.kind !== "assistant") throw new Error("unreachable");
    expect(ev.usage).toEqual({
      input: 10,
      output: 20,
      cacheCreate: 500,
      cacheCreate1h: 0,
      cacheCreate5m: 0,
      cacheRead: 0,
    });
    expect(ev.effort).toBeNull();
    expect(ev.isSidechain).toBe(false);
  });

  it("usage 自体が欠けている assistant 行はゼロ Usage で通す", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-25T10:00:00.000Z",
      message: { model: "claude-opus-5", content: [] },
    });
    const ev = parseLine(line);
    if (ev?.kind !== "assistant") throw new Error("expected assistant");
    expect(ev.usage.input).toBe(0);
    expect(ev.usage.output).toBe(0);
  });

  it("model が無い assistant 行は null を返す", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-25T10:00:00.000Z",
      message: { content: [] },
    });
    expect(parseLine(line)).toBeNull();
  });

  it("timestamp が無い assistant 行は null を返す", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { model: "claude-opus-5", content: [] },
    });
    expect(parseLine(line)).toBeNull();
  });

  it("isSidechain: true を保持する", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-25T10:00:00.000Z",
      isSidechain: true,
      message: { model: "claude-opus-5", content: [] },
    });
    const ev = parseLine(line);
    if (ev?.kind !== "assistant") throw new Error("expected assistant");
    expect(ev.isSidechain).toBe(true);
  });

  it("tool_result を持つ user 行を正規化する（is_error 省略時は false）", () => {
    const line = JSON.stringify({
      type: "user",
      timestamp: "2026-08-25T10:00:05.000Z",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tu_1", content: "ok" },
          { type: "tool_result", tool_use_id: "tu_2", content: "boom", is_error: true },
        ],
      },
    });
    expect(parseLine(line)).toEqual({
      kind: "user",
      ts: "2026-08-25T10:00:05.000Z",
      toolResults: [
        { toolUseId: "tu_1", isError: false, byteLength: 2 },
        { toolUseId: "tu_2", isError: true, byteLength: 4 },
      ],
    });
  });

  it("tool_result の content が配列でも byteLength を計算する", () => {
    const line = JSON.stringify({
      type: "user",
      timestamp: "2026-08-25T10:00:05.000Z",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_1",
            content: [
              { type: "text", text: "hello" },
              { type: "text", text: "world!" },
            ],
          },
        ],
      },
    });
    const ev = parseLine(line);
    if (ev?.kind !== "user") throw new Error("expected user");
    expect(ev.toolResults[0]?.byteLength).toBe(11);
  });

  it("byteLength は UTF-8 のバイト数で数える", () => {
    const line = JSON.stringify({
      type: "user",
      timestamp: "2026-08-25T10:00:05.000Z",
      message: {
        content: [{ type: "tool_result", tool_use_id: "tu_1", content: "あい" }],
      },
    });
    const ev = parseLine(line);
    if (ev?.kind !== "user") throw new Error("expected user");
    expect(ev.toolResults[0]?.byteLength).toBe(6);
  });

  it("message.content が文字列の user 行は toolResults を空にする", () => {
    const line = JSON.stringify({
      type: "user",
      timestamp: "2026-08-25T10:00:05.000Z",
      message: { role: "user", content: "こんにちは" },
    });
    expect(parseLine(line)).toEqual({
      kind: "user",
      ts: "2026-08-25T10:00:05.000Z",
      toolResults: [],
    });
  });

  it("user 行の tool_use_id が欠けている要素は捨てる", () => {
    const line = JSON.stringify({
      type: "user",
      timestamp: "2026-08-25T10:00:05.000Z",
      message: {
        content: [
          { type: "tool_result", content: "no id" },
          { type: "text", text: "本文" },
        ],
      },
    });
    const ev = parseLine(line);
    if (ev?.kind !== "user") throw new Error("expected user");
    expect(ev.toolResults).toEqual([]);
  });

  it("assistant 行の name/id が欠けた tool_use は捨てる", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-25T10:00:00.000Z",
      message: {
        model: "claude-opus-5",
        content: [
          { type: "tool_use", id: "tu_1", name: "Read", input: {} },
          { type: "tool_use", input: {} },
        ],
      },
    });
    const ev = parseLine(line);
    if (ev?.kind !== "assistant") throw new Error("expected assistant");
    expect(ev.toolUses).toHaveLength(1);
  });
});

describe("parseLine — meta 抽出", () => {
  it("permission-mode 行を meta として返す", () => {
    const line = JSON.stringify({
      type: "permission-mode",
      sessionId: "s1",
      permissionMode: "acceptEdits",
    });
    expect(parseLine(line)).toEqual({
      kind: "meta",
      ts: null,
      cwd: "",
      version: "",
      gitBranch: null,
      permissionMode: "acceptEdits",
    });
  });

  it("system 行から cwd / version / gitBranch を meta として取り出す", () => {
    const line = JSON.stringify({
      type: "system",
      timestamp: "2026-08-25T10:00:00.000Z",
      cwd: "/Users/x/work/cinch",
      version: "2.1.243",
      gitBranch: "main",
      subtype: "turn_summary",
    });
    expect(parseLine(line)).toEqual({
      kind: "meta",
      ts: "2026-08-25T10:00:00.000Z",
      cwd: "/Users/x/work/cinch",
      version: "2.1.243",
      gitBranch: "main",
      permissionMode: null,
    });
  });
});
