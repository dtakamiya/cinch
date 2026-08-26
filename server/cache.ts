import type { SessionMetrics, SessionScore } from "../shared/types.js";
import type { DiscoveredFile } from "./discover.js";

export interface AnalyzedSession {
  metrics: SessionMetrics;
  score: SessionScore;
}

interface Entry {
  mtimeMs: number;
  size: number;
  value: AnalyzedSession;
}

/**
 * 解析結果をプロセス内に保持する。
 * mtime と size の両方が一致するときだけ有効なキャッシュとして扱う。
 */
export class AnalysisCache {
  private readonly entries = new Map<string, Entry>();

  get(file: DiscoveredFile): AnalyzedSession | null {
    const entry = this.entries.get(file.path);
    if (entry === undefined) return null;
    if (entry.mtimeMs !== file.mtimeMs || entry.size !== file.size) return null;
    return entry.value;
  }

  set(file: DiscoveredFile, value: AnalyzedSession): void {
    this.entries.set(file.path, {
      mtimeMs: file.mtimeMs,
      size: file.size,
      value,
    });
  }

  size(): number {
    return this.entries.size;
  }
}
