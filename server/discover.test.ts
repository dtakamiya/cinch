import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  defaultRoot,
  deriveProjectName,
  discoverSessions,
  hasClaudeMd,
  unescapeProjectDir,
} from "./discover.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cinch-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("unescapeProjectDir", () => {
  it("先頭の - を / に、以降の - を / に戻す", () => {
    expect(unescapeProjectDir("-Users-x-work-cinch")).toBe("/Users/x/work/cinch");
  });

  it("先頭が - でない名前はそのまま返す", () => {
    expect(unescapeProjectDir("plain")).toBe("plain");
  });
});

describe("deriveProjectName", () => {
  it("通常の cwd は最終セグメントを返す", () => {
    expect(deriveProjectName("/Users/x/work/cinch")).toBe("cinch");
  });

  it("末尾スラッシュがあっても最終セグメントを返す", () => {
    expect(deriveProjectName("/Users/x/work/cinch/")).toBe("cinch");
  });

  it("ハッシュに見えない最終セグメント（cost/dashboad）はそのまま", () => {
    expect(deriveProjectName("/Users/x/work/cc/cost/dashboad")).toBe("dashboad");
  });

  it("homedir 直下の .claude セッションは ~/.claude と表示する", () => {
    expect(deriveProjectName(join(homedir(), ".claude"))).toBe("~/.claude");
  });

  it("末尾スラッシュ付きの homedir .claude も ~/.claude", () => {
    expect(deriveProjectName(join(homedir(), ".claude") + "/")).toBe("~/.claude");
  });

  it("プロジェクトローカルの .claude は ~/.claude 扱いしない", () => {
    expect(deriveProjectName("/Users/x/work/proj/.claude")).toBe(".claude");
  });

  it("Claude Code の worktree サフィックス（-<6桁hex>）を剥がす", () => {
    expect(
      deriveProjectName(
        "/Users/x/work/claudecode-harness-patterns/.claude/worktrees/analyze-claude-cookbooks-f438b8",
      ),
    ).toBe("analyze-claude-cookbooks");
  });

  it("worktrees 配下で最終セグメントが hex そのものなら親ディレクトリ名にフォールバック", () => {
    expect(deriveProjectName("/Users/x/work/cc/.claude/worktrees/f438b8")).toBe(
      "worktrees",
    );
  });

  it("たまたま hex 名を持つ実プロジェクト（worktrees 配下でない）はそのまま", () => {
    expect(deriveProjectName("/Users/x/work/deadbeef")).toBe("deadbeef");
    expect(deriveProjectName("/Users/x/work/facade")).toBe("facade");
    expect(deriveProjectName("/Users/x/work/abcdef12")).toBe("abcdef12");
  });

  it("hex に見えても 6〜8桁でなければ剥がさない", () => {
    expect(deriveProjectName("/Users/x/work/fix-abc")).toBe("fix-abc");
    expect(deriveProjectName("/Users/x/work/fix-abcdef01234")).toBe(
      "fix-abcdef01234",
    );
  });

  it("全数字サフィックス（日付断片）は剥がさない", () => {
    expect(deriveProjectName("/Users/x/work/feature-202608")).toBe(
      "feature-202608",
    );
    expect(deriveProjectName("/Users/x/work/v1-123456")).toBe("v1-123456");
  });

  it("大文字混じりの 16 進もどきは剥がさない（Claude Code は小文字）", () => {
    expect(deriveProjectName("/Users/x/work/feature-ABC123")).toBe(
      "feature-ABC123",
    );
  });

  it("親なしで最終セグメントが hex そのものでも bare hash を返さず placeholder", () => {
    // 到達経路は narrow だが、bare hash をラベルに出さない
    expect(deriveProjectName("-f438b8")).toBe("(不明)");
  });

  it("空文字は空文字を返す（metrics では resolvedCwd が空にならない）", () => {
    expect(deriveProjectName("")).toBe("");
  });
});

describe("defaultRoot", () => {
  it("~/.claude/projects を指す", () => {
    expect(defaultRoot()).toMatch(/\.claude[/\\]projects$/);
  });
});

describe("discoverSessions", () => {
  it("root が存在しないとき rootExists: false と空配列を返す（例外を投げない）", async () => {
    const result = await discoverSessions(join(root, "does-not-exist"));
    expect(result.rootExists).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.projectCount).toBe(0);
    expect(result.skipped).toEqual([]);
  });

  it("root が空なら空配列を返す", async () => {
    const result = await discoverSessions(root);
    expect(result.rootExists).toBe(true);
    expect(result.files).toEqual([]);
    expect(result.projectCount).toBe(0);
  });

  it(".jsonl ファイルを列挙し sessionId と fallbackCwd を付ける", async () => {
    const proj = join(root, "-Users-x-work-cinch");
    await mkdir(proj);
    await writeFile(join(proj, "abc-123.jsonl"), '{"type":"user"}\n');

    const result = await discoverSessions(root);
    expect(result.files).toHaveLength(1);
    const f = result.files[0];
    expect(f?.sessionId).toBe("abc-123");
    expect(f?.fallbackCwd).toBe("/Users/x/work/cinch");
    expect(f?.path).toBe(join(proj, "abc-123.jsonl"));
    expect(f?.size).toBeGreaterThan(0);
    expect(f?.mtimeMs).toBeGreaterThan(0);
  });

  it(".jsonl 以外のファイルを無視する", async () => {
    const proj = join(root, "-Users-x-work-cinch");
    await mkdir(proj);
    await writeFile(join(proj, "a.jsonl"), "{}\n");
    await writeFile(join(proj, "notes.md"), "hello");
    await writeFile(join(proj, "b.json"), "{}");

    const result = await discoverSessions(root);
    expect(result.files.map((f) => f.sessionId)).toEqual(["a"]);
  });

  it("空の .jsonl ファイルは skipped に入れる", async () => {
    const proj = join(root, "-Users-x-work-cinch");
    await mkdir(proj);
    await writeFile(join(proj, "empty.jsonl"), "");

    const result = await discoverSessions(root);
    expect(result.files).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain("空");
  });

  it("複数プロジェクトを横断して projectCount を数える", async () => {
    for (const name of ["-Users-x-work-a", "-Users-x-work-b"]) {
      const proj = join(root, name);
      await mkdir(proj);
      await writeFile(join(proj, "s.jsonl"), "{}\n");
    }
    const result = await discoverSessions(root);
    expect(result.files).toHaveLength(2);
    expect(result.projectCount).toBe(2);
  });

  it("root 直下のファイル（ディレクトリでないもの）は無視する", async () => {
    await writeFile(join(root, "stray.jsonl"), "{}\n");
    const result = await discoverSessions(root);
    expect(result.files).toHaveLength(0);
    expect(result.projectCount).toBe(0);
  });

  it("ファイルを持たないプロジェクトディレクトリは projectCount に数えない", async () => {
    await mkdir(join(root, "-Users-x-work-empty"));
    const proj = join(root, "-Users-x-work-a");
    await mkdir(proj);
    await writeFile(join(proj, "s.jsonl"), "{}\n");

    const result = await discoverSessions(root);
    expect(result.projectCount).toBe(1);
  });
});

describe("hasClaudeMd", () => {
  it("CLAUDE.md があれば true", async () => {
    await writeFile(join(root, "CLAUDE.md"), "# rules");
    expect(await hasClaudeMd(root)).toBe(true);
  });

  it("CLAUDE.md が無ければ false", async () => {
    expect(await hasClaudeMd(root)).toBe(false);
  });

  it("ディレクトリ自体が無くても false（例外を投げない）", async () => {
    expect(await hasClaudeMd(join(root, "nope"))).toBe(false);
  });

  it("空文字を渡しても false", async () => {
    expect(await hasClaudeMd("")).toBe(false);
  });
});
