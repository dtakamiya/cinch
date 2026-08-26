# 採点ルール追加 `task-planning` / `oversized-tool-results` 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cinch の採点モデルに `task-planning`（practice, 配点 4）と `oversized-tool-results`（productivity, 配点 4）の 2 ルールを追加し、10 ルール→12 ルールに拡張する（合計は 100 点のまま）。

**Architecture:** 既存の `Rule` パターン（純粋関数 `evaluate(m: SessionMetrics): RuleResult`）にそのまま乗せる。`task-planning` はメトリクス追加なし（既存の `assistantTurns` / `toolCalls` / `toolsByName` だけを見る）。`oversized-tool-results` は `shared/types.ts` の `SessionMetrics` に 3 フィールド追加し、`server/metrics.ts` の `toolResults` ループ内で集計する。`parse.ts` は変更しない（`ToolResult.byteLength` は既存）。配点は `redundant-file-reads` / `parallel-tool-use` / `subagent-delegation` / `claude-md-present` から 2 点ずつ計 8 点を捻出して新 2 ルールへ配る。

**Tech Stack:** TypeScript（サーバは `tsconfig.server.json`, `module: NodeNext`, 相対 import は `.js` 拡張子付き / `verbatimModuleSyntax` / `noUncheckedIndexedAccess`）、Vitest（デフォルト環境 `node`）。

**Spec:** `docs/superpowers/specs/2026-08-26-two-new-rules-design.md`

## Global Constraints

- **`WEIGHTS`（`server/config/thresholds.ts`）の合計は常に 100。** 新ルールを足すぶん既存を減らす。
- **数値リテラルをルール実装に直接書かない。** 閾値はすべて `server/config/thresholds.ts` の `THRESHOLDS` に置く。
- **`metrics.ts` は「事実」だけを数える。良し悪しの判断はしない。** 閾値比較（`> largeResultBytes`）を metrics に書くのは集計のための線引きであり、スコア化はしない。
- **fs に触らない。** `metrics.ts` 以降は純粋関数。
- **API 応答に会話本文を含めない。** 追加するのは数値（バイト長）とツール名のみ。
- サーバの相対 import は `.js` 拡張子付き（`import { x } from "./types.js"`）。型のみの import は `import type`。
- 配列・Record のインデックスアクセスは `undefined` チェックが要る（`noUncheckedIndexedAccess`）。
- ルール追加の手順（CLAUDE.md）: (1) `server/rules/<name>.ts` に純粋関数で実装、(2) `WEIGHTS` に配点追加・合計 100 維持、(3) `server/rules/index.ts` の `ALL_RULES` に登録、(4) `src/format.ts` の `RULE_LABELS` に日本語名追加。
- 検証コマンド: `npm run typecheck && npm test`。

---

## File Structure

作成・変更するファイルと責務:

- `server/config/thresholds.ts`（変更）— `WEIGHTS` を新配点に更新。`THRESHOLDS` に `taskPlanning` / `oversizedToolResults` ブロックを追加。
- `shared/types.ts`（変更）— `SessionMetrics` に `oversizedResults` / `largestResultBytes` / `largestResultTool` の 3 フィールドを追加。
- `server/metrics.ts`（変更）— `toolResults` ループ内で 3 フィールドを集計し、返り値に含める。
- `server/rules/testHelpers.ts`（変更）— `metricsFixture()` に新 3 フィールドの 0 値を追加。
- `server/rules/taskPlanning.ts`（新規）— `task-planning` ルール本体。
- `server/rules/oversizedToolResults.ts`（新規）— `oversized-tool-results` ルール本体。
- `server/rules/index.ts`（変更）— `ALL_RULES` に 2 ルールを登録。
- `src/format.ts`（変更）— `RULE_LABELS` に日本語名 2 件を追加。
- `server/rules/taskPlanning.test.ts`（新規）— `task-planning` の単体テスト。
- `server/rules/oversizedToolResults.test.ts`（新規）— `oversized-tool-results` の単体テスト。
- `server/metrics.test.ts`（変更）— oversized 集計のテストケースを追加。
- `server/rules/index.test.ts`（変更）— ルール件数を 10→12 に更新。
- `server/score.test.ts`（変更）— 12 ルールでの整合性チェック（既存の「max 合計 100」「35/35/30」は据え置きで通るはず）。

タスク順序: 配点変更（Task 1）→ メトリクス拡張（Task 2）→ `oversized-tool-results` ルール（Task 3）→ `task-planning` ルール（Task 4）→ 登録とラベル（Task 5）→ 回帰テスト更新と全体検証（Task 6）。

---

## Task 1: 配点変更（`WEIGHTS` の再配分）

新ルールの実装より先に配点表を確定させる。この時点では `ALL_RULES` にまだ新ルールが無いため、`server/rules/index.test.ts` の「`WEIGHTS` のすべての ID をカバーしている」が落ちる。それは Task 5 で解消するので、このタスクでは `thresholds.ts` 単体の型チェックと、`server/config/thresholds.test.ts` があればそれだけを確認する。

**Files:**
- Modify: `server/config/thresholds.ts:7-21`（`WEIGHTS`）、`server/config/thresholds.ts:25-111`（`THRESHOLDS` に 2 ブロック追加）
- Test: `npm run typecheck`（`thresholds.ts` の構文とキー整合）

**Interfaces:**
- Consumes: なし
- Produces:
  - `WEIGHTS` に新キー `"oversized-tool-results": 4` と `"task-planning": 4` が入り、`RuleId` 型（`keyof typeof WEIGHTS`）に両 ID が含まれる。合計は 100。
  - `THRESHOLDS.taskPlanning = { minTurns: 15, minCalls: 20 }`
  - `THRESHOLDS.oversizedToolResults = { largeResultBytes: 12000, perfectAtMost: 0, zeroAtLeast: 6, minCalls: 10 }`

- [ ] **Step 1: `WEIGHTS` を新配点に書き換える**

`server/config/thresholds.ts` の `WEIGHTS` オブジェクト（7〜21 行目）を次に置き換える:

```ts
export const WEIGHTS = {
  // コスト効率（35）
  "cache-efficiency": 15,
  "cache-ttl-waste": 10,
  "model-fit": 10,
  // 生産性（35）
  "tool-error-rate": 12,
  "redundant-file-reads": 6,
  "parallel-tool-use": 6,
  "turn-efficiency": 7,
  "oversized-tool-results": 4,
  // ベストプラクティス（30）
  "subagent-delegation": 10,
  "context-growth": 10,
  "claude-md-present": 6,
  "task-planning": 4,
} as const satisfies Record<string, number>;
```

（cost 35 = 15+10+10 / productivity 35 = 12+6+6+7+4 / practice 30 = 10+10+6+4、合計 100）

- [ ] **Step 2: `THRESHOLDS` に 2 ブロックを追加**

`server/config/thresholds.ts` の `THRESHOLDS` オブジェクト末尾、`contextGrowth: { ... },`（103〜110 行目）の直後・閉じ `} as const;` の直前に追加:

```ts
  oversizedToolResults: {
    /** これを超える tool_result を「巨大」とみなす（バイト） */
    largeResultBytes: 12000,
    /** 巨大な結果がこれ以下なら満点 */
    perfectAtMost: 0,
    /** これ以上なら 0 点 */
    zeroAtLeast: 6,
    /** ツール呼び出しがこれ未満なら判定しない（満点扱い） */
    minCalls: 10,
  },

  taskPlanning: {
    /** assistant ターンがこれ未満なら判定しない（満点扱い） */
    minTurns: 15,
    /** ツール呼び出しがこれ未満なら判定しない（満点扱い） */
    minCalls: 20,
  },
```

- [ ] **Step 3: 型チェックで `WEIGHTS` の整合を確認**

Run: `npm run typecheck`
Expected: `thresholds.ts` 自体はエラーなし。`server/rules/index.ts` などで「型 `RuleId` に新 ID の実装が無い」等のエラーが出るのは想定内（Task 3〜5 で解消）。`thresholds.ts` にオブジェクトリテラルの構文エラーやキー重複が無いことだけ確認する。

- [ ] **Step 4: コミット**

```bash
git add server/config/thresholds.ts
git commit -m "feat: 採点ルール2本追加に向けて WEIGHTS を再配分し閾値を追加

redundant-file-reads / parallel-tool-use / subagent-delegation /
claude-md-present から計8点を捻出し、oversized-tool-results と
task-planning に各4点を割り当てる。合計は100のまま。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SXty6bhCxnWppzeAbN8rMk"
```

---

## Task 2: `SessionMetrics` に oversized 集計フィールドを追加

`shared/types.ts` の型に 3 フィールドを足し、`server/metrics.ts` で集計する。`metricsFixture()` にも 0 値を足す。

**Files:**
- Modify: `shared/types.ts:57-84`（`SessionMetrics`、`parseErrors` の直前に 3 行追加）
- Modify: `server/metrics.ts`（ローカル変数宣言・`toolResults` ループ内の集計・返り値オブジェクト）
- Modify: `server/rules/testHelpers.ts:10-38`（`metricsFixture()` の戻り値に 3 行追加）
- Test: `server/metrics.test.ts`

**Interfaces:**
- Consumes: `THRESHOLDS.oversizedToolResults.largeResultBytes`（Task 1 で追加済み）、既存の `ToolResult.byteLength: number`、既存の `toolNameById: Map<string, string>`。
- Produces: `SessionMetrics` に
  - `oversizedResults: number` — `byteLength > largeResultBytes` だった `tool_result` の件数
  - `largestResultBytes: number` — 最大の `tool_result` バイト長（無ければ 0）
  - `largestResultTool: string | null` — その最大結果を出したツール名（無ければ null）

  集計は user イベントの `for (const r of ev.toolResults)` ループ内。`toolNameById.get(r.toolUseId)` が `undefined` の結果は既存コードどおり `continue` してカウントしない。

- [ ] **Step 1: 失敗するテストを書く（metrics 集計）**

`server/metrics.test.ts` の末尾（`describe("computeMetrics — キャッシュ失効", ...)` ブロックの後、ファイル最終行の前）に追加:

```ts
describe("computeMetrics — 巨大なツール結果", () => {
  it("largeResultBytes を超えた tool_result の件数と最大値・ツール名を集計する", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", {
          tools: [
            { id: "a", name: "Read" },
            { id: "b", name: "Bash" },
            { id: "c", name: "Grep" },
          ],
        }),
        usr("2026-08-25T10:00:01.000Z", [
          { id: "a", bytes: 20000 },
          { id: "b", bytes: 13000 },
          { id: "c", bytes: 500 },
        ]),
      ],
    });
    expect(m.oversizedResults).toBe(2);
    expect(m.largestResultBytes).toBe(20000);
    expect(m.largestResultTool).toBe("Read");
  });

  it("12000 ちょうどは巨大に数えない（境界は排他）", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", { tools: [{ id: "a", name: "Read" }] }),
        usr("2026-08-25T10:00:01.000Z", [{ id: "a", bytes: 12000 }]),
      ],
    });
    expect(m.oversizedResults).toBe(0);
    expect(m.largestResultBytes).toBe(12000);
    expect(m.largestResultTool).toBe("Read");
  });

  it("巨大な結果が無ければ 0 / 0 / null", () => {
    const m = computeMetrics({
      ...base,
      events: [
        asst("2026-08-25T10:00:00.000Z", { tools: [{ id: "a", name: "Read" }] }),
        usr("2026-08-25T10:00:01.000Z", [{ id: "a", bytes: 100 }]),
      ],
    });
    expect(m.oversizedResults).toBe(0);
    expect(m.largestResultBytes).toBe(100);
    expect(m.largestResultTool).toBe("Read");
  });

  it("tool_use を引き当てられない結果はカウントしない", () => {
    const m = computeMetrics({
      ...base,
      events: [usr("2026-08-25T10:00:01.000Z", [{ id: "ghost", bytes: 30000 }])],
    });
    expect(m.oversizedResults).toBe(0);
    expect(m.largestResultBytes).toBe(0);
    expect(m.largestResultTool).toBeNull();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run server/metrics.test.ts -t "巨大なツール結果"`
Expected: FAIL。`m.oversizedResults` / `m.largestResultBytes` / `m.largestResultTool` が `undefined`（型エラーまたは `expected undefined to be 2` など）。

- [ ] **Step 3: `SessionMetrics` に 3 フィールドを追加**

`shared/types.ts` の `SessionMetrics`（57〜84 行目）で、`parseErrors: number;`（83 行目）の直前に追加:

```ts
  /** largeResultBytes を超えた tool_result の件数 */
  oversizedResults: number;
  /** 最大の tool_result バイト長（無ければ 0） */
  largestResultBytes: number;
  /** その最大結果を出したツール名（無ければ null） */
  largestResultTool: string | null;
```

- [ ] **Step 4: `metrics.ts` にローカル変数を宣言**

`server/metrics.ts` の `let redundantReads = 0;`（55 行目）付近、`computeMetrics` 関数内のカウンタ宣言が並ぶ箇所に追加（`let toolCalls = 0;` の近くが素直）:

```ts
  let oversizedResults = 0;
  let largestResultBytes = 0;
  let largestResultTool: string | null = null;
```

- [ ] **Step 5: `toolResults` ループ内で集計する**

`server/metrics.ts` の user イベント処理（92〜103 行目）を次に置き換える。既存の `name === undefined` で `continue`、`r.isError` のカウントはそのまま残し、その下に oversized 集計を足す:

```ts
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
```

- [ ] **Step 6: 返り値オブジェクトに 3 フィールドを追加**

`server/metrics.ts` の `return { ... }`（199〜226 行目）で、`parseErrors,`（225 行目）の直前に追加:

```ts
    oversizedResults,
    largestResultBytes,
    largestResultTool,
```

- [ ] **Step 7: `metricsFixture()` に 0 値を追加**

`server/rules/testHelpers.ts` の `metricsFixture()` 戻り値（10〜38 行目）で、`parseErrors: 0,`（35 行目）の直前に追加:

```ts
    oversizedResults: 0,
    largestResultBytes: 0,
    largestResultTool: null,
```

- [ ] **Step 8: テストを実行して通ることを確認**

Run: `npx vitest run server/metrics.test.ts`
Expected: PASS（新規 4 ケースを含め metrics.test.ts 全件）。

- [ ] **Step 9: 型チェック**

Run: `npm run typecheck`
Expected: `metrics.ts` / `types.ts` / `testHelpers.ts` に起因するエラーはなし。まだ `server/rules/index.ts` 周辺で新ルール未実装のエラーが残るのは想定内。

- [ ] **Step 10: コミット**

```bash
git add shared/types.ts server/metrics.ts server/rules/testHelpers.ts server/metrics.test.ts
git commit -m "feat: SessionMetrics に巨大なツール結果の集計を追加

toolResults ループ内で byteLength > largeResultBytes(12000) の件数と
最大バイト長・そのツール名を数える。tool_use を引き当てられない結果は
既存どおりスキップ。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SXty6bhCxnWppzeAbN8rMk"
```

---

## Task 3: `oversized-tool-results` ルール

`scaleDown` で件数が増えるほど減点する。`toolCalls < minCalls` は判定対象外（満点）。

**Files:**
- Create: `server/rules/oversizedToolResults.ts`
- Test: `server/rules/oversizedToolResults.test.ts`

**Interfaces:**
- Consumes:
  - `SessionMetrics.oversizedResults` / `.largestResultBytes` / `.largestResultTool` / `.toolCalls`（Task 2 で追加済み）
  - `THRESHOLDS.oversizedToolResults.{ minCalls, perfectAtMost, zeroAtLeast }`（Task 1）
  - `WEIGHTS["oversized-tool-results"]`（Task 1、値 4）
  - `server/rules/types.ts` の `perfect`, `scaleDown`, 型 `Rule` / `RuleResult`
- Produces:
  - `export const oversizedToolResultsRule: Rule`（`id: "oversized-tool-results"`, `category: "productivity"`, `weight: 4`, `label: "巨大なツール結果"`）
  - `evaluate` は `score === 1` で `perfect(evidence)`、それ以外は `{ score, evidence, advice }`（`advice` は非 null）。

- [ ] **Step 1: 失敗するテストを書く**

`server/rules/oversizedToolResults.test.ts` を作成:

```ts
import { describe, expect, it } from "vitest";
import { oversizedToolResultsRule } from "./oversizedToolResults.js";
import { metricsFixture } from "./testHelpers.js";

describe("oversized-tool-results", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(oversizedToolResultsRule.id).toBe("oversized-tool-results");
    expect(oversizedToolResultsRule.category).toBe("productivity");
    expect(oversizedToolResultsRule.weight).toBe(4);
  });

  it("ツール呼び出しが minCalls 未満なら判定対象外で満点", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({ toolCalls: 5, oversizedResults: 3 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
    expect(r.evidence).toContain("判定対象外");
  });

  it("巨大な結果が 0 件なら満点", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({ toolCalls: 30, oversizedResults: 0 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("3 件なら部分点（0 < score < 1）で advice が非 null", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({
        toolCalls: 30,
        oversizedResults: 3,
        largestResultBytes: 20000,
        largestResultTool: "Read",
      }),
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
    expect(r.advice).not.toBeNull();
    expect(r.evidence).toContain("3");
    expect(r.evidence).toContain("Read");
  });

  it("6 件（zeroAtLeast）で 0 点", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({
        toolCalls: 30,
        oversizedResults: 6,
        largestResultBytes: 56000,
        largestResultTool: "Read",
      }),
    );
    expect(r.score).toBe(0);
  });

  it("largestResultTool が null のとき evidence にツール名の括弧書きを出さない", () => {
    const r = oversizedToolResultsRule.evaluate(
      metricsFixture({
        toolCalls: 30,
        oversizedResults: 3,
        largestResultBytes: 20000,
        largestResultTool: null,
      }),
    );
    // "（最大 20KB）" の形。ツール名や "null" の語を含まない
    expect(r.evidence).toContain("最大 20KB）");
    expect(r.evidence).not.toContain("null");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run server/rules/oversizedToolResults.test.ts`
Expected: FAIL（`Cannot find module './oversizedToolResults.js'`）。

- [ ] **Step 3: ルールを実装**

`server/rules/oversizedToolResults.ts` を作成:

```ts
import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { perfect, scaleDown, type Rule, type RuleResult } from "./types.js";

export const oversizedToolResultsRule: Rule = {
  id: "oversized-tool-results",
  category: "productivity",
  weight: WEIGHTS["oversized-tool-results"],
  label: "巨大なツール結果",
  evaluate(m: SessionMetrics): RuleResult {
    if (m.toolCalls < THRESHOLDS.oversizedToolResults.minCalls) {
      return perfect(
        `ツール呼び出しが ${m.toolCalls} 回のため判定対象外です。`,
      );
    }

    const score = scaleDown(
      m.oversizedResults,
      THRESHOLDS.oversizedToolResults.perfectAtMost,
      THRESHOLDS.oversizedToolResults.zeroAtLeast,
    );

    if (score === 1) {
      return perfect("1 回で 12KB を超えるツール結果はありません。");
    }

    const kb = Math.round(m.largestResultBytes / 1024);
    const detail =
      m.largestResultTool === null
        ? `（最大 ${kb}KB）`
        : `（最大 ${kb}KB、${m.largestResultTool}）`;
    const evidence = `1 回で 12KB を超えるツール結果が ${m.oversizedResults} 回${detail}。`;

    return {
      score,
      evidence,
      advice:
        "1 回のツール呼び出しで大量のテキストを取り込むと、その全文が以降のターンで文脈に載り続けます。Read は offset / limit で必要な範囲だけ、Bash の出力は head や grep で絞ってください。ページ全文の取得や広い範囲の調査は、サブエージェントに任せて結論だけ受け取ると文脈が膨らみません。",
    };
  },
};
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx vitest run server/rules/oversizedToolResults.test.ts`
Expected: PASS（6 ケース）。

- [ ] **Step 5: コミット**

```bash
git add server/rules/oversizedToolResults.ts server/rules/oversizedToolResults.test.ts
git commit -m "feat: oversized-tool-results ルールを追加

1回で12KBを超えるツール結果の件数を scaleDown で減点する。
toolCalls < 10 は判定対象外。largestResultTool が null のときは
evidence のツール名括弧書きを省く。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SXty6bhCxnWppzeAbN8rMk"
```

---

## Task 4: `task-planning` ルール

`TodoWrite` を 1 回でも使っていれば満点、使っていなければ 0 点の二値。規模未満（`assistantTurns < minTurns` または `toolCalls < minCalls`）は判定対象外で満点。メトリクス追加はなし。

**Files:**
- Create: `server/rules/taskPlanning.ts`
- Test: `server/rules/taskPlanning.test.ts`

**Interfaces:**
- Consumes:
  - `SessionMetrics.assistantTurns` / `.toolCalls` / `.toolsByName`（既存）
  - `THRESHOLDS.taskPlanning.{ minTurns, minCalls }`（Task 1）
  - `WEIGHTS["task-planning"]`（Task 1、値 4）
  - `server/rules/types.ts` の `perfect`, 型 `Rule` / `RuleResult`
- Produces:
  - `export const taskPlanningRule: Rule`（`id: "task-planning"`, `category: "practice"`, `weight: 4`, `label: "タスクの計画"`）
  - `evaluate` は判定対象外・`TodoWrite` 使用ありで `perfect(evidence)`、使用なしで `{ score: 0, evidence, advice }`（`advice` 非 null）。
  - `toolsByName["TodoWrite"]` は `noUncheckedIndexedAccess` により `{ calls, errors } | undefined`。`?.calls ?? 0` で件数を取る。

- [ ] **Step 1: 失敗するテストを書く**

`server/rules/taskPlanning.test.ts` を作成:

```ts
import { describe, expect, it } from "vitest";
import { taskPlanningRule } from "./taskPlanning.js";
import { metricsFixture } from "./testHelpers.js";

describe("task-planning", () => {
  it("ID / カテゴリ / 配点を持つ", () => {
    expect(taskPlanningRule.id).toBe("task-planning");
    expect(taskPlanningRule.category).toBe("practice");
    expect(taskPlanningRule.weight).toBe(4);
  });

  it("assistant ターンが minTurns 未満なら判定対象外で満点", () => {
    const r = taskPlanningRule.evaluate(
      metricsFixture({ assistantTurns: 10, toolCalls: 50 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("ツール呼び出しが minCalls 未満なら判定対象外で満点", () => {
    const r = taskPlanningRule.evaluate(
      metricsFixture({ assistantTurns: 30, toolCalls: 10 }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
  });

  it("規模を満たし TodoWrite を1回でも使っていれば満点", () => {
    const r = taskPlanningRule.evaluate(
      metricsFixture({
        assistantTurns: 30,
        toolCalls: 50,
        toolsByName: { TodoWrite: { calls: 1, errors: 0 } },
      }),
    );
    expect(r.score).toBe(1);
    expect(r.advice).toBeNull();
    expect(r.evidence).toContain("1");
  });

  it("規模を満たし TodoWrite が無ければ 0 点で advice が非 null", () => {
    const r = taskPlanningRule.evaluate(
      metricsFixture({ assistantTurns: 30, toolCalls: 50, toolsByName: {} }),
    );
    expect(r.score).toBe(0);
    expect(r.advice).not.toBeNull();
    expect(r.evidence).toContain("50");
    expect(r.evidence).toContain("30");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run server/rules/taskPlanning.test.ts`
Expected: FAIL（`Cannot find module './taskPlanning.js'`）。

- [ ] **Step 3: ルールを実装**

`server/rules/taskPlanning.ts` を作成:

```ts
import type { SessionMetrics } from "../../shared/types.js";
import { THRESHOLDS, WEIGHTS } from "../config/thresholds.js";
import { perfect, type Rule, type RuleResult } from "./types.js";

export const taskPlanningRule: Rule = {
  id: "task-planning",
  category: "practice",
  weight: WEIGHTS["task-planning"],
  label: "タスクの計画",
  evaluate(m: SessionMetrics): RuleResult {
    const todoCalls = m.toolsByName["TodoWrite"]?.calls ?? 0;

    if (
      m.assistantTurns < THRESHOLDS.taskPlanning.minTurns ||
      m.toolCalls < THRESHOLDS.taskPlanning.minCalls
    ) {
      return perfect(
        "計画ツールを要する規模のセッションではないため判定対象外です。",
      );
    }

    if (todoCalls >= 1) {
      return perfect(
        `ツール呼び出し ${m.toolCalls} 回のセッションで TodoWrite を ${todoCalls} 回使用。`,
      );
    }

    return {
      score: 0,
      evidence: `ツール呼び出し ${m.toolCalls} 回・${m.assistantTurns} ターンのセッションで TodoWrite の使用なし。`,
      advice:
        "3 ステップ以上の作業や複数ファイルにまたがる調査は、着手前に TodoWrite でタスクへ分解してください。やることを先に並べると抜け漏れが減り、ユーザーが進捗を追えます。スキルのチェックリストがある場合は 1 項目ずつ todo にすると確実です。",
    };
  },
};
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx vitest run server/rules/taskPlanning.test.ts`
Expected: PASS（5 ケース）。

- [ ] **Step 5: コミット**

```bash
git add server/rules/taskPlanning.ts server/rules/taskPlanning.test.ts
git commit -m "feat: task-planning ルールを追加

計画に値する規模（15ターン以上かつ20ツール呼び出し以上）で
TodoWrite を一度も使っていなければ0点、1回でも使えば満点の二値。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SXty6bhCxnWppzeAbN8rMk"
```

---

## Task 5: `ALL_RULES` への登録と `RULE_LABELS` の追加

2 ルールをレジストリに登録し、UI 用の日本語ラベルを足す。これで `server/rules/index.ts` 周辺の型エラー（`RuleId` に実装が無い）が解消される。

**Files:**
- Modify: `server/rules/index.ts:1-11`（import 追加）、`server/rules/index.ts:18-32`（`ALL_RULES` に 2 件追加）
- Modify: `src/format.ts:51-62`（`RULE_LABELS` に 2 件追加）
- Test: `npm run typecheck`、`npx vitest run server/rules/index.test.ts`（Task 6 で件数を更新するまで一部落ちるので、ここでは typecheck を主に見る）

**Interfaces:**
- Consumes: `oversizedToolResultsRule`（Task 3）、`taskPlanningRule`（Task 4）
- Produces: `ALL_RULES` が 12 要素になり、`ALL_RULES.map((r) => r.id).sort()` が `Object.keys(WEIGHTS).sort()` と一致する。

- [ ] **Step 1: `server/rules/index.ts` に import を追加**

既存の import 群（アルファベット順に並んでいる）に 2 行足す。`import { modelFitRule } from "./modelFit.js";` の後に:

```ts
import { oversizedToolResultsRule } from "./oversizedToolResults.js";
```

`import { parallelToolUseRule } from "./parallelToolUse.js";` の後に:

```ts
import { taskPlanningRule } from "./taskPlanning.js";
```

（結果として import は `cacheEfficiency, cacheTtlWaste, claudeMdPresent, contextGrowth, modelFit, oversizedToolResults, parallelToolUse, redundantFileReads, subagentDelegation, taskPlanning, toolErrorRate, turnEfficiency` の順）

- [ ] **Step 2: `ALL_RULES` に 2 ルールを登録**

`server/rules/index.ts` の `ALL_RULES` 配列を次に置き換える:

```ts
export const ALL_RULES: Rule[] = [
  // コスト効率（35）
  cacheEfficiencyRule,
  cacheTtlWasteRule,
  modelFitRule,
  // 生産性（35）
  toolErrorRateRule,
  redundantFileReadsRule,
  parallelToolUseRule,
  turnEfficiencyRule,
  oversizedToolResultsRule,
  // ベストプラクティス（30）
  subagentDelegationRule,
  contextGrowthRule,
  claudeMdPresentRule,
  taskPlanningRule,
];
```

- [ ] **Step 3: `src/format.ts` の `RULE_LABELS` に日本語名を追加**

`RULE_LABELS` オブジェクトで `"turn-efficiency": "ターンあたりの生産量",` の後に:

```ts
  "oversized-tool-results": "巨大なツール結果",
```

`"claude-md-present": "CLAUDE.md の有無",` の後に:

```ts
  "task-planning": "タスクの計画",
```

- [ ] **Step 4: 型チェック**

Run: `npm run typecheck`
Expected: PASS（フロント・サーバ両方エラーなし）。

- [ ] **Step 5: コミット**

```bash
git add server/rules/index.ts src/format.ts
git commit -m "feat: 新ルール2本を ALL_RULES に登録し日本語ラベルを追加

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SXty6bhCxnWppzeAbN8rMk"
```

---

## Task 6: 回帰テストの更新と全体検証

ルール件数を前提にしたテストを 10→12 に更新し、`npm run typecheck && npm test` を通す。

**Files:**
- Modify: `server/rules/index.test.ts:7-9`（「10 件」→「12 件」）
- Test: `npm test`（全件）、`npm run typecheck`

**Interfaces:**
- Consumes: Task 1〜5 の成果（`WEIGHTS` 合計 100、`ALL_RULES` 12 件、新ルール実装、`metricsFixture` の新フィールド）
- Produces: なし（検証のみ）

- [ ] **Step 1: `server/rules/index.test.ts` のルール件数を更新**

`it("10 件のルールを登録している", () => {` のブロック（7〜9 行目）を次に置き換える:

```ts
  it("12 件のルールを登録している", () => {
    expect(ALL_RULES).toHaveLength(12);
  });
```

- [ ] **Step 2: `server/rules/index.test.ts` を実行**

Run: `npx vitest run server/rules/index.test.ts`
Expected: PASS。特に「配点の合計が 100 である」「WEIGHTS のすべての ID をカバーしている」「各ルールの weight が WEIGHTS と一致する」「満点のとき advice は null、減点のとき advice は非 null」が通ること。

> 補足: 「どのルールも 0〜1 の score を返す」ケースの `metricsFixture` は `toolCalls: 100` を渡しているため `oversized-tool-results` / `task-planning` とも判定対象に入る。`oversizedResults` は未指定＝0 なので `oversized-tool-results` は満点、`task-planning` は `toolsByName` に `TodoWrite` が無く `assistantTurns` 既定 10 < 15 なので判定対象外で満点。いずれも 0〜1 に収まる。

- [ ] **Step 3: `server/score.test.ts` を実行**

Run: `npx vitest run server/score.test.ts`
Expected: PASS。「配点の max 合計が 100 である」「カテゴリの max が 35 / 35 / 30 である」が新配点でも通ること（cost 15+10+10=35 / productivity 12+6+6+7+4=35 / practice 10+10+6+4=30）。

- [ ] **Step 4: 全テストを実行**

Run: `npm test`
Expected: PASS（全ファイル）。API テスト（`createApp({ root })` 経由）で `SessionDetailResponse.metrics` に新フィールドが載っても既存アサーションは壊れない想定。落ちたら該当テストを読み、新フィールドを期待値に加えるか無視する形に直す。

- [ ] **Step 5: 型チェック**

Run: `npm run typecheck`
Expected: PASS（フロント `tsconfig.json` / サーバ `tsconfig.server.json` 両方）。

- [ ] **Step 6: コミット**

```bash
git add server/rules/index.test.ts
git commit -m "test: ルール件数の前提を12件に更新

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SXty6bhCxnWppzeAbN8rMk"
```

---

## Self-Review

**1. Spec coverage:**

| スペックの項目 | 対応タスク |
|---|---|
| ルール 1 `task-planning`（判定ロジック・二値・判定対象外） | Task 4 |
| `task-planning` の閾値 `minTurns:15 / minCalls:20` | Task 1 Step 2 |
| `task-planning` の evidence（満点時・0 点時） | Task 4 Step 3 |
| `task-planning` の advice | Task 4 Step 3 |
| ルール 2 `oversized-tool-results`（scaleDown での減点） | Task 3 |
| `SessionMetrics` に 3 フィールド追加 | Task 2 Step 3 |
| `metrics.ts` の集計（`toolResults` ループ内、`name === undefined` は continue） | Task 2 Step 4〜6 |
| `oversized-tool-results` の閾値 `largeResultBytes:12000 / perfectAtMost:0 / zeroAtLeast:6 / minCalls:10` | Task 1 Step 2 |
| `oversized-tool-results` の evidence（満点時・減点時・`largestResultTool` null 分岐） | Task 3 Step 3 + テスト Step 1 |
| `oversized-tool-results` の advice | Task 3 Step 3 |
| 配点変更（`WEIGHTS` 合計 100 維持、4 ルールから捻出） | Task 1 Step 1 |
| `src/format.ts` の `RULE_LABELS` に 2 件追加 | Task 5 Step 3 |
| `server/rules/index.ts` の `ALL_RULES` 登録（productivity は `turnEfficiencyRule` の後、practice は `claudeMdPresentRule` の後） | Task 5 Step 2 |
| `metricsFixture()` に 3 フィールド追加 | Task 2 Step 7 |
| `taskPlanning.test.ts`（規模未満／使用あり／使用なし） | Task 4 Step 1 |
| `oversizedToolResults.test.ts`（対象外／0 件／部分点／0 点／null 分岐） | Task 3 Step 1 |
| `metrics.test.ts` に oversized 集計ケース追加 | Task 2 Step 1 |
| `index.test.ts` / `score.test.ts`（合計 100・`ALL_RULES.length === 12`） | Task 6 Step 1〜3 |
| `npm run typecheck && npm test` で完了確認 | Task 6 Step 4〜5 |

ギャップなし。

**2. Placeholder scan:** 各コード step に実コードを記載済み。「適切なエラー処理」等の曖昧表現なし。テストコードは全文記載。

**3. Type consistency:**
- 新フィールド名 `oversizedResults` / `largestResultBytes` / `largestResultTool` は `types.ts`（Task 2 Step 3）、`metrics.ts` 宣言（Step 4）、集計（Step 5）、返り値（Step 6）、`testHelpers.ts`（Step 7）、両ルールテストで一貫。
- `largestResultTool` の型は `string | null`。metrics 初期値 `null`、fixture 既定 `null`、ルールの分岐 `=== null` で一致。
- ルール ID 文字列 `"oversized-tool-results"` / `"task-planning"` は `WEIGHTS` キー（Task 1）、ルール `id`（Task 3/4）、`RULE_LABELS` キー（Task 5）で一致。
- `THRESHOLDS.oversizedToolResults` / `THRESHOLDS.taskPlanning` のプロパティ名（`largeResultBytes` / `perfectAtMost` / `zeroAtLeast` / `minCalls` / `minTurns`）は定義（Task 1）と参照（Task 2 Step 5, Task 3 Step 3, Task 4 Step 3）で一致。
- `perfect` / `scaleDown` は `server/rules/types.ts` の既存エクスポート。シグネチャ `scaleDown(value, perfectBelow, zeroAbove)` に対しスペック引数順（`oversizedResults, perfectAtMost, zeroAtLeast`）で呼ぶ — 意味的に `perfectAtMost`→`perfectBelow`、`zeroAtLeast`→`zeroAbove` に対応、`scaleDown` は `value <= perfectBelow` で 1・`value >= zeroAbove` で 0 なので件数 0→満点・6→0 点が成立。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-26-two-new-rules.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
