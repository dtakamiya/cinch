import { deriveProjectName } from "./discover.js";
import {
  emptyUsage,
  type Event,
  type SessionMetrics,
  type ToolUse,
} from "../shared/types.js";
import { THRESHOLDS } from "./config/thresholds.js";

export interface MetricsInput {
  sessionId: string;
  events: Event[];
  parseErrors: number;
  hasClaudeMd: boolean;
  /** meta 行が無かったときに使う cwd（ディレクトリ名から復元したもの） */
  fallbackCwd: string;
}

/** 副作用の無い読み取り専用ツール。並列化・単純作業の判定に使う。 */
const READ_ONLY_TOOLS = new Set(["Read", "Grep", "Glob"]);
/** ファイルを変更するツール。冗長読み込みの判定で「編集を挟んだ」を検出する。 */
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

const ONE_HOUR_MS = 60 * 60 * 1000;

function filePathOf(tool: ToolUse): string | null {
  const input = tool.input;
  if (typeof input !== "object" || input === null) return null;
  const p = (input as Record<string, unknown>)["file_path"];
  return typeof p === "string" && p.length > 0 ? p : null;
}

/** Bash の command 文字列。Bash 以外や取れない場合は null。 */
function bashCommandOf(tool: ToolUse): string | null {
  if (tool.name !== "Bash") return null;
  const input = tool.input;
  if (typeof input !== "object" || input === null) return null;
  const c = (input as Record<string, unknown>)["command"];
  return typeof c === "string" && c.length > 0 ? c : null;
}

/**
 * コマンド列の先頭語を返す。`cd foo && cat bar` のような連結は、
 * 実際に何をしたかが先頭語に出ないので区切りごとに見る必要がある。
 * ここでは最初のセグメントの先頭語だけを返す（誤検知を避ける保守的な判定）。
 */
function leadingWord(command: string): string {
  const first = command.trim().split(/[\n;|&]/)[0] ?? "";
  const word = first.trim().split(/\s+/)[0] ?? "";
  // `sudo cat` のような接頭辞は剥がさない。素の呼び出しだけを対象にする。
  return word;
}

/**
 * イベント列を数え上げてセッション指標にする。
 * ここでは「良し悪しの判断」を一切しない。閾値は rules/ 側で使う。
 */
export function computeMetrics(input: MetricsInput): SessionMetrics {
  const { sessionId, events, parseErrors, hasClaudeMd, fallbackCwd } = input;

  let cwd = "";
  let version = "";
  let gitBranch: string | null = null;

  let assistantTurns = 0;
  let sidechainTurns = 0;
  const models: Record<string, number> = {};
  const totals = emptyUsage();

  let toolCalls = 0;
  let toolErrors = 0;
  let oversizedResults = 0;
  let largestResultBytes = 0;
  let largestResultTool: string | null = null;
  const toolsByName: Record<string, { calls: number; errors: number }> = {};
  /** tool_use_id → ツール名。tool_result はツール名を持たないので引き当てる。 */
  const toolNameById = new Map<string, string>();

  let redundantReads = 0;
  /** 直近に Read したファイル（編集が入ったら削除する） */
  const readSinceEdit = new Set<string>();

  let editCalls = 0;
  let verificationCalls = 0;
  let bashInsteadOfTool = 0;
  const bashInsteadOfToolByCommand: Record<string, number> = {};
  let peakContextTokens = 0;

  let parallelizableOpportunities = 0;
  let parallelizableSequences = 0;

  let heavyExplorationTurns = 0;
  let simpleWorkTurns = 0;
  let simpleWorkOnExpensiveModel = 0;

  const contextGrowth: number[] = [];

  let cache1hCreations = 0;
  let cacheExpirations = 0;
  /** 未回収の 1h キャッシュ作成（作成時刻の配列） */
  const pending1h: number[] = [];

  const timestamps: number[] = [];
  let startedAt = "";
  let endedAt = "";

  for (const ev of events) {
    if (ev.kind === "meta") {
      if (cwd === "" && ev.cwd !== "") cwd = ev.cwd;
      if (version === "" && ev.version !== "") version = ev.version;
      if (gitBranch === null && ev.gitBranch !== null) gitBranch = ev.gitBranch;
      continue;
    }

    const t = Date.parse(ev.ts);
    if (Number.isFinite(t)) {
      timestamps.push(t);
      if (startedAt === "") startedAt = ev.ts;
      endedAt = ev.ts;
    }

    if (ev.kind === "user") {
      for (const r of ev.toolResults) {
        const name = toolNameById.get(r.toolUseId);
        if (name === undefined) continue;
        if (r.isError) {
          toolErrors++;
          const entry = toolsByName[name];
          if (entry !== undefined) entry.errors++;
        }
        if (r.byteLength > THRESHOLDS.oversizedToolResults.largeResultBytes) {
          oversizedResults++;
        }
        if (r.byteLength > largestResultBytes) {
          largestResultBytes = r.byteLength;
          largestResultTool = name;
        }
      }
      continue;
    }

    // ---- assistant ----
    assistantTurns++;
    if (ev.isSidechain) sidechainTurns++;
    models[ev.model] = (models[ev.model] ?? 0) + 1;

    totals.input += ev.usage.input;
    totals.output += ev.usage.output;
    totals.cacheCreate += ev.usage.cacheCreate;
    totals.cacheCreate1h += ev.usage.cacheCreate1h;
    totals.cacheCreate5m += ev.usage.cacheCreate5m;
    totals.cacheRead += ev.usage.cacheRead;

    // そのターン時点でモデルに送られた文脈の大きさ
    contextGrowth.push(ev.usage.input + ev.usage.cacheRead);

    // 上限への迫り具合はキャッシュ作成分も含めた実際の送信量で測る
    const contextTokens =
      ev.usage.input + ev.usage.cacheRead + ev.usage.cacheCreate;
    if (contextTokens > peakContextTokens) peakContextTokens = contextTokens;

    // --- キャッシュ失効 ---
    const turnTime = Number.isFinite(t) ? t : 0;
    if (ev.usage.cacheRead > 0) {
      // 作成から 1 時間以内のものだけが回収される
      for (let i = pending1h.length - 1; i >= 0; i--) {
        const created = pending1h[i];
        if (created === undefined) continue;
        if (turnTime - created <= ONE_HOUR_MS) pending1h.splice(i, 1);
      }
    }
    if (ev.usage.cacheCreate1h > 0) {
      cache1hCreations++;
      pending1h.push(turnTime);
    }

    // --- ツール ---
    for (const tool of ev.toolUses) {
      toolCalls++;
      toolNameById.set(tool.id, tool.name);
      const entry = toolsByName[tool.name];
      if (entry === undefined) {
        toolsByName[tool.name] = { calls: 1, errors: 0 };
      } else {
        entry.calls++;
      }

      if (WRITE_TOOLS.has(tool.name)) editCalls++;

      const command = bashCommandOf(tool);
      if (command !== null) {
        // 検証コマンド: パイプの途中や引数に現れても検証と見なす（取りこぼしを避ける）
        if (
          THRESHOLDS.verificationGap.commandPatterns.some((p) =>
            command.includes(p),
          )
        ) {
          verificationCalls++;
        }
        // 専用ツールでの代替: 先頭語だけを見る（保守的に判定する）
        const head = leadingWord(command);
        if (THRESHOLDS.bashOverNativeTools.replaceableCommands.includes(head)) {
          bashInsteadOfTool++;
          bashInsteadOfToolByCommand[head] =
            (bashInsteadOfToolByCommand[head] ?? 0) + 1;
        }
      }
    }

    // --- 冗長な再読み込み ---
    for (const tool of ev.toolUses) {
      const path = filePathOf(tool);
      if (path === null) continue;
      if (WRITE_TOOLS.has(tool.name)) {
        // 編集したファイルは読み直しが正当になる
        readSinceEdit.delete(path);
      } else if (tool.name === "Read") {
        if (readSinceEdit.has(path)) redundantReads++;
        else readSinceEdit.add(path);
      }
    }

    // --- 並列化の機会 ---
    // 「明らかに独立」と分かるケース = 読み取り専用ツールだけのターンに限定する。
    // 判定できないケースを機会に数えないことで、誤検知での減点を避ける。
    const allReadOnly =
      ev.toolUses.length > 0 &&
      ev.toolUses.every((tu) => READ_ONLY_TOOLS.has(tu.name));
    if (allReadOnly) {
      parallelizableOpportunities++;
      // 1 件しか呼んでいない = まとめられたはずのものを逐次実行した
      if (ev.toolUses.length === 1) parallelizableSequences++;
      if (ev.toolUses.length >= THRESHOLDS.subagentDelegation.heavyToolCallsPerTurn) {
        heavyExplorationTurns++;
      }
    }

    // --- 単純作業とモデル適合 ---
    const simpleTools = THRESHOLDS.modelFit.simpleTools;
    const isSimpleWork =
      ev.toolUses.length > 0 &&
      ev.toolUses.every((tu) => simpleTools.includes(tu.name));
    if (isSimpleWork) {
      simpleWorkTurns++;
      const expensive = THRESHOLDS.modelFit.expensiveModelPatterns.some((p) =>
        ev.model.includes(p),
      );
      if (expensive) simpleWorkOnExpensiveModel++;
    }
  }

  // 回収されなかった 1h キャッシュ作成が失効
  cacheExpirations = pending1h.length;

  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const durationMs =
    first !== undefined && last !== undefined ? Math.max(0, last - first) : 0;

  const resolvedCwd = cwd !== "" ? cwd : fallbackCwd;

  return {
    sessionId,
    cwd: resolvedCwd,
    projectName: deriveProjectName(resolvedCwd),
    startedAt,
    endedAt,
    durationMs,
    assistantTurns,
    models,
    totals,
    toolCalls,
    toolErrors,
    toolsByName,
    redundantReads,
    parallelizableSequences,
    parallelizableOpportunities,
    sidechainTurns,
    heavyExplorationTurns,
    simpleWorkTurns,
    simpleWorkOnExpensiveModel,
    contextGrowth,
    cacheExpirations,
    cache1hCreations,
    hasClaudeMd,
    gitBranch,
    version,
    oversizedResults,
    largestResultBytes,
    largestResultTool,
    editCalls,
    verificationCalls,
    bashInsteadOfTool,
    bashInsteadOfToolByCommand,
    peakContextTokens,
    parseErrors,
  };
}
