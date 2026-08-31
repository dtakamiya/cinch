/**
 * E2E 用の採点済みセッションログを生成する。
 *
 * 本物の ~/.claude/projects には依存しない。ここで最小限の JSONL を書き出し、
 * server/index.ts に CINCH_ROOT で読み込ませることで、実データの有無・件数に
 * 左右されない安定した smoke を回せるようにする。
 *
 * JSONL の形は server/api.test.ts の sessionLines() に合わせている
 * （Claude Code のセッションログのサブセット）。
 *
 * 生成物:
 *  - <root>/-e2e-proj-a/e2e-a.jsonl   （採点対象・5 ターン）
 *  - <root>/-e2e-proj-b/e2e-b.jsonl
 *  - <root>/-e2e-proj-c/e2e-c.jsonl
 *
 * ベンチマーク画面は「採点済み 3 件以上」で統計（中央値・箱ひげ）を出す分岐が
 * あるため、プロジェクトを 3 つ用意する（benchmark.ts MIN_GRADED_FOR_STATS = 3）。
 *
 * 注意: ここで生成するセッションのタイムスタンプは 2026-08-25 固定。ベンチマーク
 * 画面の期間フィルタ（24h / 7d / 30d）を操作する smoke を後で足すときは、
 * 「今」からの相対期間で絞られるので Date.now() をテスト側で clock 固定
 * （page.clock.setFixedTime など）しないと日付が進むにつれ 0 件になる。
 * 現状の smoke は期間フィルタを触らない（既定「すべて」）ので固定日付で問題ない。
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 生成先。playwright.config.ts の webServer.env の CINCH_ROOT と一致させること。 */
export const SEED_ROOT = join(HERE, "..", ".tmp-sessions");

/** 詳細画面の URL に使う実在 sessionId。fixture と一致させる。 */
export const DETAIL_SESSION_ID = "e2e-a";

interface SeedProject {
  /** ~/.claude/projects 直下のディレクトリ名（エスケープ済み cwd） */
  dir: string;
  /** ログ本文の cwd。projectName の導出に使われる */
  cwd: string;
  sessionId: string;
  turns: number;
}

const PROJECTS: SeedProject[] = [
  { dir: "-e2e-proj-a", cwd: "/e2e/proj-a", sessionId: "e2e-a", turns: 6 },
  { dir: "-e2e-proj-b", cwd: "/e2e/proj-b", sessionId: "e2e-b", turns: 5 },
  { dir: "-e2e-proj-c", cwd: "/e2e/proj-c", sessionId: "e2e-c", turns: 7 },
];

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
            {
              type: "tool_use",
              id: `tu_${i}`,
              name: "Read",
              input: { file_path: `/f${i}.ts` },
            },
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

/** SEED_ROOT を作り直して fixture を書き出す。 */
export async function seed(): Promise<void> {
  await rm(SEED_ROOT, { recursive: true, force: true });
  for (const p of PROJECTS) {
    const projDir = join(SEED_ROOT, p.dir);
    await mkdir(projDir, { recursive: true });
    await writeFile(
      join(projDir, `${p.sessionId}.jsonl`),
      sessionLines(p.cwd, p.turns),
    );
  }
}

/**
 * fixture を消す（後片付け用）。
 *
 * 現状どこからも呼んでいない。意図的にそうしている:
 *  - SEED_ROOT は .gitignore 済みで、seed() が毎回 rm してから作り直すため
 *    残っても無害（次回実行で上書き）。
 *  - 失敗時に中身を残しておくと調査に使える。
 *  - CI ランナーは使い捨て。
 * global-teardown で消したくなったら呼び出しを足すこと。
 */
export async function cleanup(): Promise<void> {
  await rm(SEED_ROOT, { recursive: true, force: true });
}

// `tsx e2e/fixtures/seed.ts` で直接実行された場合はシードだけ行う。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seed().then(
    () => console.log(`seeded E2E sessions at ${SEED_ROOT}`),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
