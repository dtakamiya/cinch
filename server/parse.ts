import {
  emptyUsage,
  type Event,
  type ToolResult,
  type ToolUse,
  type Usage,
} from "../shared/types.js";

/** 未知の形の値を安全に扱うためのヘルパ群 */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** message.usage の入れ子を Usage に平坦化する。生の構造をここから外に出さない。 */
function parseUsage(raw: unknown): Usage {
  if (!isObject(raw)) return emptyUsage();
  const creation = isObject(raw["cache_creation"]) ? raw["cache_creation"] : {};
  return {
    input: num(raw["input_tokens"]),
    output: num(raw["output_tokens"]),
    cacheCreate: num(raw["cache_creation_input_tokens"]),
    cacheCreate1h: num(creation["ephemeral_1h_input_tokens"]),
    cacheCreate5m: num(creation["ephemeral_5m_input_tokens"]),
    cacheRead: num(raw["cache_read_input_tokens"]),
  };
}

/** tool_result.content は文字列のことも配列のこともある。本文は保持せず長さだけ数える。 */
function contentByteLength(content: unknown): number {
  if (typeof content === "string") return Buffer.byteLength(content, "utf8");
  if (Array.isArray(content)) {
    let total = 0;
    for (const part of content) {
      if (isObject(part) && typeof part["text"] === "string") {
        total += Buffer.byteLength(part["text"], "utf8");
      }
    }
    return total;
  }
  return 0;
}

function parseToolUses(content: unknown): ToolUse[] {
  if (!Array.isArray(content)) return [];
  const out: ToolUse[] = [];
  for (const part of content) {
    if (!isObject(part) || part["type"] !== "tool_use") continue;
    const id = str(part["id"]);
    const name = str(part["name"]);
    if (id === null || name === null) continue;
    out.push({ id, name, input: part["input"] });
  }
  return out;
}

function parseToolResults(content: unknown): ToolResult[] {
  if (!Array.isArray(content)) return [];
  const out: ToolResult[] = [];
  for (const part of content) {
    if (!isObject(part) || part["type"] !== "tool_result") continue;
    const toolUseId = str(part["tool_use_id"]);
    if (toolUseId === null) continue;
    out.push({
      toolUseId,
      isError: part["is_error"] === true,
      byteLength: contentByteLength(part["content"]),
    });
  }
  return out;
}

/**
 * JSONL の 1 行を正規化イベントに変換する。
 * 解釈できない行・関心のない行は null を返す（呼び出し側でスキップする）。
 */
export function parseLine(line: string): Event | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;

  const type = raw["type"];

  if (type === "assistant") {
    const message = raw["message"];
    if (!isObject(message)) return null;
    const model = str(message["model"]);
    const ts = str(raw["timestamp"]);
    if (model === null || ts === null) return null;
    return {
      kind: "assistant",
      ts,
      model,
      // effort は message の中ではなく行のトップレベルにある
      effort: str(raw["effort"]),
      usage: parseUsage(message["usage"]),
      toolUses: parseToolUses(message["content"]),
      isSidechain: raw["isSidechain"] === true,
    };
  }

  if (type === "user") {
    const ts = str(raw["timestamp"]);
    if (ts === null) return null;
    const message = raw["message"];
    const content = isObject(message) ? message["content"] : undefined;
    return { kind: "user", ts, toolResults: parseToolResults(content) };
  }

  if (type === "system" || type === "permission-mode" || type === "mode") {
    return {
      kind: "meta",
      ts: str(raw["timestamp"]),
      cwd: str(raw["cwd"]) ?? "",
      version: str(raw["version"]) ?? "",
      gitBranch: str(raw["gitBranch"]),
      permissionMode: str(raw["permissionMode"]) ?? str(raw["mode"]),
    };
  }

  // 未知の type は無視する（前方互換）
  return null;
}
