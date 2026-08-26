import { readdir, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
