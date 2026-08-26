import { readdir, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { SkippedFile } from "../shared/types.js";

export interface DiscoveredFile {
  path: string;
  sessionId: string;
  /** ~/.claude/projects 直下のディレクトリ名（エスケープされた cwd） */
  projectDir: string;
  /** ディレクトリ名から復元した cwd。ログ本文の cwd が取れないときのフォールバック */
  fallbackCwd: string;
  mtimeMs: number;
  size: number;
}

export interface DiscoverResult {
  files: DiscoveredFile[];
  projectCount: number;
  skipped: SkippedFile[];
  rootExists: boolean;
}

export function defaultRoot(): string {
  return join(homedir(), ".claude", "projects");
}

/**
 * "-Users-x-work-cinch" → "/Users/x/work/cinch"
 * 元のパスに "-" が含まれていた場合は復元できないため、
 * ログ本文の cwd が取れるならそちらを優先すること。
 */
export function unescapeProjectDir(name: string): string {
  if (!name.startsWith("-")) return name;
  return name.replace(/-/g, "/");
}

/**
 * Claude Code が git worktree の cwd 重複時に付ける "-<6〜8桁hex>" サフィックス。
 * lookahead で hex 文字列に最低 1 つ a-f を要求し、純粋な日付断片（全数字）を除外する。
 */
const WORKTREE_SUFFIX = /-(?=[0-9a-f]*[a-f])[0-9a-f]{6,8}$/;
/** 最終セグメントが hex そのもの（＝名前部分が無い）ケースの検出用。 */
const BARE_HEX = /^[0-9a-f]{6,8}$/;

/**
 * cwd から一覧表示用のプロジェクト名を導出する（fs に触らない純粋関数）。
 *
 * - `~/.claude` 直下（グローバル設定をいじったセッション）は "~/.claude" と表示する。
 *   homedir にアンカーし、プロジェクトローカルの `.claude` は対象外。
 * - 最終セグメントから Claude Code が付ける worktree サフィックス（"-<6〜8桁hex>"）を剥がす。
 * - `~/.claude/worktrees/<hex>` のように最終セグメントが hex そのものなら親ディレクトリ名にフォールバック。
 * - 剥がした結果が空になる場合も親ディレクトリ名にフォールバック。
 * - それ以外は `basename` と同じ（`cost/dashboad` → `dashboad`）。
 */
export function deriveProjectName(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, "");
  if (trimmed === join(homedir(), ".claude")) return "~/.claude";

  const base = basename(trimmed);
  const parentOf = () => {
    const parent = basename(dirname(trimmed));
    // 親が取れない（相対パスで親なし）＝既知の行き止まり。placeholder を返す。
    return parent !== "" && parent !== "." && parent !== "/" ? parent : "(不明)";
  };

  // worktree 由来の bare hex サフィックスは常に ".../worktrees/<hex>" の形。
  // たまたま hex 名を持つ実プロジェクト（deadbeef 等）を親名に化けさせない。
  if (BARE_HEX.test(base) && basename(dirname(trimmed)) === "worktrees") {
    return parentOf();
  }
  if (!WORKTREE_SUFFIX.test(base)) return base;

  const stripped = base.replace(WORKTREE_SUFFIX, "");
  return stripped !== "" ? stripped : parentOf();
}

/**
 * ~/.claude/projects 配下の .jsonl を列挙する。
 * 読み取りのみ。書き込み系の fs API を使わないこと。
 */
export async function discoverSessions(
  root: string = defaultRoot(),
): Promise<DiscoverResult> {
  const files: DiscoveredFile[] = [];
  const skipped: SkippedFile[] = [];
  let projectCount = 0;

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    // ~/.claude/projects が無いのは異常ではない（まだ Claude Code を使っていない等）
    return { files: [], projectCount: 0, skipped: [], rootExists: false };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectDir = entry.name;
    const dirPath = join(root, projectDir);

    let inner;
    try {
      inner = await readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      skipped.push({ path: dirPath, reason: `ディレクトリを読めません: ${messageOf(err)}` });
      continue;
    }

    let foundInThisProject = 0;
    for (const file of inner) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
      const path = join(dirPath, file.name);

      let info;
      try {
        info = await stat(path);
      } catch (err) {
        skipped.push({ path, reason: `情報を取得できません: ${messageOf(err)}` });
        continue;
      }

      if (info.size === 0) {
        skipped.push({ path, reason: "ファイルが空です" });
        continue;
      }

      files.push({
        path,
        sessionId: file.name.slice(0, -".jsonl".length),
        projectDir,
        fallbackCwd: unescapeProjectDir(projectDir),
        mtimeMs: info.mtimeMs,
        size: info.size,
      });
      foundInThisProject++;
    }

    if (foundInThisProject > 0) projectCount++;
  }

  return { files, projectCount, skipped, rootExists: true };
}

/** セッションの cwd に CLAUDE.md があるか。metrics の純粋性を保つためここで確認する。 */
export async function hasClaudeMd(cwd: string): Promise<boolean> {
  if (cwd === "") return false;
  try {
    await access(join(cwd, "CLAUDE.md"), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
