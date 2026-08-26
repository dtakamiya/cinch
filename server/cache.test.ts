import { describe, expect, it } from "vitest";
import { AnalysisCache } from "./cache.js";
import { metricsFixture } from "./rules/testHelpers.js";
import { computeScore } from "./score.js";
import type { DiscoveredFile } from "./discover.js";

function file(overrides: Partial<DiscoveredFile> = {}): DiscoveredFile {
  return {
    path: "/tmp/p/s1.jsonl",
    sessionId: "s1",
    projectDir: "-tmp-p",
    fallbackCwd: "/tmp/p",
    mtimeMs: 1000,
    size: 500,
    ...overrides,
  };
}

function analyzed(sessionId = "s1") {
  const metrics = metricsFixture({ sessionId, assistantTurns: 10 });
  return { metrics, score: computeScore(metrics) };
}

describe("AnalysisCache", () => {
  it("未登録なら null を返す", () => {
    const cache = new AnalysisCache();
    expect(cache.get(file())).toBeNull();
  });

  it("同じ path / mtime / size ならキャッシュを返す", () => {
    const cache = new AnalysisCache();
    const value = analyzed();
    cache.set(file(), value);
    expect(cache.get(file())).toBe(value);
  });

  it("mtime が変わればキャッシュを無効にする", () => {
    const cache = new AnalysisCache();
    cache.set(file({ mtimeMs: 1000 }), analyzed());
    expect(cache.get(file({ mtimeMs: 2000 }))).toBeNull();
  });

  it("size が変わればキャッシュを無効にする", () => {
    const cache = new AnalysisCache();
    cache.set(file({ size: 500 }), analyzed());
    expect(cache.get(file({ size: 900 }))).toBeNull();
  });

  it("path が違えば別エントリとして扱う", () => {
    const cache = new AnalysisCache();
    const a = analyzed("a");
    cache.set(file({ path: "/tmp/p/a.jsonl" }), a);
    expect(cache.get(file({ path: "/tmp/p/b.jsonl" }))).toBeNull();
    expect(cache.get(file({ path: "/tmp/p/a.jsonl" }))).toBe(a);
  });

  it("同じ path を上書きしてもエントリ数は増えない", () => {
    const cache = new AnalysisCache();
    cache.set(file({ mtimeMs: 1000 }), analyzed());
    cache.set(file({ mtimeMs: 2000 }), analyzed());
    expect(cache.size()).toBe(1);
  });
});
