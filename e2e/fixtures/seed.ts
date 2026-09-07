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
 *  - <root>/-e2e-proj-a/e2e-a.jsonl        （採点対象・6 ターン。詳細画面の対象）
 *  - <root>/-e2e-proj-b/e2e-b.jsonl        （採点対象・5 ターン）
 *  - <root>/-e2e-proj-c/e2e-c.jsonl        （採点対象・7 ターン）
 *  - <root>/-e2e-proj-ungraded/e2e-ungraded.jsonl（2 ターン → gradable:false）
 *  - <root>/-e2e-trend-proj/trend-1..4.jsonl（同一プロジェクトの時系列。推移グラフ用）
 *
 * ベンチマーク画面は「採点済み 3 件以上」で統計（中央値・箱ひげ）を出す分岐が
 * あるため、プロジェクトを 3 つ以上用意する（benchmark.ts MIN_GRADED_FOR_STATS = 3）。
 *
 * ── 推移グラフ（ScoreTrend / CategoryScoreTrends）用の時系列 ──
 * trend-proj は「同一プロジェクトに複数の採点済みセッションが、複数の ISO 週に
 * またがって存在する」状態を作る。
 *  - ScoreTrend は採点済み 2 件以上で描画する（points.length >= 2）。
 *  - CategoryScoreTrends は採点済み 2 件以上 かつ 週が 2 つ以上で描画する。
 * trend-1/2 を 2026-07 の同じ週、trend-3 を翌週、trend-4 をさらに翌週に置き、
 * 3 週 4 セッションにしている。ターン数を散らして total スコアに差を付け、
 * 折れ線・移動平均・先週比デルタが「動く」ようにしている。
 *
 * 注意: ここで生成するセッションのタイムスタンプは 2026 年の固定日。ベンチマーク
 * 画面や一覧の期間フィルタ（24h / 7d / 30d）を操作する smoke を足すときは、
 * 「今」からの相対期間で絞られるので Date.now() をテスト側で clock 固定
 * （page.clock.setFixedTime など）しないと日付が進むにつれ 0 件になる。
 * 現状の smoke は期間フィルタを触らない（既定「すべて」）ので固定日付で問題ない。
 * 週バケット（categoryTrend.ts weekStartUtc）は絶対時刻ベースなので日付が進んでも安定。
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 生成先。playwright.config.ts の webServer.env の CINCH_ROOT と一致させること。 */
export const SEED_ROOT = join(HERE, "..", ".tmp-sessions");

/**
 * 「セッションログのディレクトリが存在しない」状態を作るための、絶対に存在しない
 * パス。SEED_ROOT 配下に置くので seed() の rm で毎回消え、mkdir もしないため
 * readdir が必ず失敗する → server は rootExists:false を返し、一覧は NO_ROOT
 * メッセージの .notice を、ベンチマークは「採点済みなし」の .notice を出す。
 * playwright.config.ts の 2 つ目の webServer が CINCH_ROOT にこれを渡す。
 */
export const EMPTY_ROOT = join(SEED_ROOT, "__nonexistent__");

/**
 * 空 fixture サーバのポートと URL。playwright.config.ts の 2 つ目の webServer と、
 * empty.spec.ts の test.use({ baseURL }) がこれを共有する（マジックナンバーの散逸防止）。
 * 通常サーバ側のポートは他ファイルと共有しないので playwright.config.ts に置いている。
 */
export const EMPTY_WEB_PORT = 5275;
export const EMPTY_API_PORT = 5276;
export const EMPTY_BASE_URL = `http://127.0.0.1:${EMPTY_WEB_PORT}`;

/** 詳細画面の URL に使う実在 sessionId。fixture と一致させる。 */
export const DETAIL_SESSION_ID = "e2e-a";

/**
 * 推移グラフ用プロジェクトの表示名（deriveProjectName(cwd) の結果）。
 * フィルタの <select> の option value と一致する。trend / filters の smoke が使う。
 */
export const TREND_PROJECT_NAME = "trend-proj";

/** 採点対象（gradable:true）になる 1 プロジェクト 1 セッションの fixture 群。 */
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
  // assistantTurns < THRESHOLDS.minGradableTurns(3) → gradable:false。
  // 「採点対象外を表示」フィルタ（.filter-pill 4 番目）の smoke で使う。
  {
    dir: "-e2e-proj-ungraded",
    cwd: "/e2e/proj-ungraded",
    sessionId: "e2e-ungraded",
    turns: 2,
  },
];

/** 推移グラフ用。同一プロジェクト（trend-proj）× 複数週の時系列。 */
const TREND_DIR = "-e2e-trend-proj";
const TREND_CWD = "/e2e/trend-proj";

interface TrendSession {
  sessionId: string;
  turns: number;
  /** セッション開始の絶対時刻（UTC ミリ秒） */
  startUtcMs: number;
}

const TREND_SESSIONS: TrendSession[] = [
  // 2026-07-06(月) の週
  { sessionId: "trend-1", turns: 4, startUtcMs: Date.UTC(2026, 6, 6, 10, 0, 0) },
  { sessionId: "trend-2", turns: 10, startUtcMs: Date.UTC(2026, 6, 8, 10, 0, 0) },
  // 2026-07-13(月) の週
  { sessionId: "trend-3", turns: 6, startUtcMs: Date.UTC(2026, 6, 14, 10, 0, 0) },
  // 2026-07-20(月) の週
  { sessionId: "trend-4", turns: 12, startUtcMs: Date.UTC(2026, 6, 22, 10, 0, 0) },
];

/**
 * JSONL 本文を組み立てる。
 * @param cwd        ログ本文の cwd
 * @param turns      assistant ターン数
 * @param startUtcMs セッション開始の絶対時刻（UTC ミリ秒）。既定 2026-08-25。
 * @param model      使用モデル
 */
function sessionLines(
  cwd: string,
  turns: number,
  startUtcMs: number = Date.UTC(2026, 7, 25, 9, 59, 59),
  model = "claude-sonnet-5",
): string {
  // init は開始時刻。以降 assistant ターンを 1 分刻み、tool_result はその 30 秒後。
  const at = (offsetMs: number) => new Date(startUtcMs + offsetMs).toISOString();

  const lines: string[] = [
    JSON.stringify({
      type: "system",
      subtype: "init",
      timestamp: at(0),
      cwd,
      version: "2.1.243",
      gitBranch: "main",
    }),
  ];
  for (let i = 0; i < turns; i++) {
    lines.push(
      JSON.stringify({
        type: "assistant",
        timestamp: at(60_000 + i * 60_000),
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
        timestamp: at(60_000 + i * 60_000 + 30_000),
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

  const trendDir = join(SEED_ROOT, TREND_DIR);
  await mkdir(trendDir, { recursive: true });
  for (const s of TREND_SESSIONS) {
    await writeFile(
      join(trendDir, `${s.sessionId}.jsonl`),
      sessionLines(TREND_CWD, s.turns, s.startUtcMs),
    );
  }
  // EMPTY_ROOT（SEED_ROOT/__nonexistent__）は意図的に作らない。
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
