# 採点ルール追加: `task-planning` と `oversized-tool-results`

- 日付: 2026-08-26
- 種別: 既存採点モデルへのルール追加（bounded 追加 2 本）
- 関連: `docs/superpowers/specs/2026-08-25-cinch-design.md`（採点モデルの全体設計）

## 背景と目的

cinch は現在 3 カテゴリ・10 ルール・100 点満点でセッションを採点している。
実データ（直近 40 セッション）を調べたところ、以下 2 つの改善余地が採点でカバーされていないことが分かった。

1. **タスク分解の不在**: 40 セッション中、`TodoWrite` の使用はわずか 1 回。
   turns が 100 を超える長尺セッションでも 0 回。マルチステップの作業を計画せずに
   進めている状態が、どのルールでも検出されていない。
2. **一度に大量のテキストを取り込む操作**: `tool_result` のバイト長分布は
   p95 ≈ 9KB、p99 ≈ 22KB、最大 56KB（ほぼ `Read` の丸読み）。
   件数としては全体の 4% 程度だが、1 回で 12KB を超える結果が 5〜7 件出るセッションが
   複数あり、その全文が以降のターンで文脈に載り続ける。既存の `cache-efficiency` /
   `context-growth` は「結果（文脈が膨らんだ）」を見るが、「原因（どのツールが
   どれだけ取り込んだか）」を名指しできない。

このスペックは上記 2 点をそれぞれ 1 ルールとして追加する。いずれも既存の `Rule`
パターン（純粋関数 `evaluate(m: SessionMetrics): RuleResult`）にそのまま乗る。

### スコープ外

- `parse.ts` の変更（`ToolResult.byteLength` は既に存在するため不要）。
- 新カテゴリの追加。両ルールとも既存カテゴリに収める。
- 閾値のセルフチューニング機構。初期値は本スペックで実データから決め、
  以後は `thresholds.ts` の手調整前提（既存ルールと同じ運用）。

## ルール 1: `task-planning`（カテゴリ: practice, 配点 4）

### 判定内容

「計画に値する規模のセッションで `TodoWrite` を一度も使っていないか」を二値で見る。
頻度は問わない。1 回でも使っていれば満点。

### 使用メトリクス（すべて既存）

- `m.assistantTurns`
- `m.toolCalls`
- `m.toolsByName["TodoWrite"]?.calls`

### ロジック

```
todoCalls = m.toolsByName["TodoWrite"]?.calls ?? 0

if (m.assistantTurns < THRESHOLDS.taskPlanning.minTurns ||
    m.toolCalls < THRESHOLDS.taskPlanning.minCalls) {
  return perfect("計画ツールを要する規模のセッションではないため判定対象外です。")
}

score = todoCalls >= 1 ? 1 : 0
```

`score === 1` のときは `perfect(evidence)` を返す（`advice` は null）。
`score === 0` のときは `evidence` と `advice` を返す。

### 閾値（`server/config/thresholds.ts`）

```ts
taskPlanning: {
  /** assistant ターンがこれ未満なら判定しない（満点扱い） */
  minTurns: 15,
  /** ツール呼び出しがこれ未満なら判定しない（満点扱い） */
  minCalls: 20,
},
```

実データ根拠: `minTurns:15 & minCalls:20` は短い Q&A セッションを除外しつつ、
実作業セッション（40 件中、この条件を満たすものが十分数ある）を確実に対象にする。

### evidence

- 満点時: `` `ツール呼び出し ${m.toolCalls} 回のセッションで TodoWrite を ${todoCalls} 回使用。` ``
- 0 点時: `` `ツール呼び出し ${m.toolCalls} 回・${m.assistantTurns} ターンのセッションで TodoWrite の使用なし。` ``

### advice（0 点時のみ）

> 3 ステップ以上の作業や複数ファイルにまたがる調査は、着手前に TodoWrite でタスクへ分解してください。やることを先に並べると抜け漏れが減り、ユーザーが進捗を追えます。スキルのチェックリストがある場合は 1 項目ずつ todo にすると確実です。

## ルール 2: `oversized-tool-results`（カテゴリ: productivity, 配点 4）

### 判定内容

「1 回のツール呼び出しで大量のテキスト（12KB 超）を取り込んだ回数」を数え、
件数が増えるほど減点する。

### メトリクス追加

`parse.ts` は変更しない（`ToolResult.byteLength` は既存）。
`server/metrics.ts` の集計と `shared/types.ts` の `SessionMetrics` を拡張する。

`SessionMetrics` に追加するフィールド:

```ts
/** largeResultBytes を超えた tool_result の件数 */
oversizedResults: number;
/** 最大の tool_result バイト長（無ければ 0） */
largestResultBytes: number;
/** その最大結果を出したツール名（無ければ null） */
largestResultTool: string | null;
```

`metrics.ts` の集計追加箇所は、user イベントの `for (const r of ev.toolResults)`
ループ内（既に `toolErrors` を数えている箇所と同じ場所）。ツール名は既存の
`toolNameById.get(r.toolUseId)` で引ける。

```ts
// ループ内、name 取得後
if (r.byteLength > THRESHOLDS.oversizedToolResults.largeResultBytes) {
  oversizedResults++;
}
if (r.byteLength > largestResultBytes) {
  largestResultBytes = r.byteLength;
  largestResultTool = name;
}
```

`name` が `undefined`（tool_use を引き当てられない）の場合は、既存コードと同様に
`continue` してカウントしない。

### ロジック（`server/rules/oversizedToolResults.ts`）

```
if (m.toolCalls < THRESHOLDS.oversizedToolResults.minCalls) {
  return perfect(`ツール呼び出しが ${m.toolCalls} 回のため判定対象外です。`)
}

score = scaleDown(
  m.oversizedResults,
  THRESHOLDS.oversizedToolResults.perfectAtMost,  // 0
  THRESHOLDS.oversizedToolResults.zeroAtLeast,    // 6
)
```

`score === 1` のときは `perfect(evidence)`。それ以外は `evidence` + `advice`。

### 閾値（`server/config/thresholds.ts`）

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
```

実データ根拠: `tool_result` の 12KB 超は全体の約 4%。`>10KB` が 5〜7 件のセッションが
複数あり、`zeroAtLeast:6` はそれらを 0〜0.2 点に落とす。大半のセッション（0〜2 件）は
高得点を維持する。`largeResultBytes:12000` は p95(≈9KB) と p99(≈22KB) の間で、
上位数 % の結果だけを拾う水準。

### evidence

- 満点時: `` `1 回で 12KB を超えるツール結果はありません。` ``
- 減点時: `` `1 回で 12KB を超えるツール結果が ${m.oversizedResults} 回（最大 ${Math.round(m.largestResultBytes / 1024)}KB、${m.largestResultTool}）。` ``
  - `largestResultTool` が null になるのは `oversizedResults > 0` かつ最大結果のツール名が
    引けなかった稀なケース。その場合は `（最大 …KB）` のみ表示する分岐を入れる。

### advice（減点時のみ）

> 1 回のツール呼び出しで大量のテキストを取り込むと、その全文が以降のターンで文脈に載り続けます。Read は offset / limit で必要な範囲だけ、Bash の出力は head や grep で絞ってください。ページ全文の取得や広い範囲の調査は、サブエージェントに任せて結論だけ受け取ると文脈が膨らみません。

## 配点変更（`WEIGHTS`, 合計 100 を維持）

| カテゴリ | ルール | 現行 | 変更後 |
|---|---|---:|---:|
| cost | cache-efficiency | 15 | 15 |
| cost | cache-ttl-waste | 10 | 10 |
| cost | model-fit | 10 | 10 |
| **cost 小計** | | **35** | **35** |
| productivity | tool-error-rate | 12 | 12 |
| productivity | redundant-file-reads | 8 | **6** |
| productivity | parallel-tool-use | 8 | **6** |
| productivity | turn-efficiency | 7 | 7 |
| productivity | **oversized-tool-results（新規）** | — | **4** |
| **productivity 小計** | | **35** | **35** |
| practice | subagent-delegation | 12 | **10** |
| practice | context-growth | 10 | 10 |
| practice | claude-md-present | 8 | **6** |
| practice | **task-planning（新規）** | — | **4** |
| **practice 小計** | | **30** | **30** |
| **合計** | | **100** | **100** |

削り先の理由:

- `redundant-file-reads` と `parallel-tool-use` から各 2 点:
  どちらも `oversized-tool-results` と同じ「情報の取り込み方が雑」という問題圏にあり、
  新ルールがその一部を引き受けるため、重複緩和として妥当。
- `subagent-delegation` 12→10、`claude-md-present` 8→6:
  practice の中で相対的に配点が重かった 2 つから捻出。`task-planning` も
  「進め方（委譲・計画）」の系統なので、この 3 者で配分し直すのが自然。

## 実装手順（CLAUDE.md「ルールを追加する手順」準拠）

### 共通

1. `server/config/thresholds.ts`
   - `WEIGHTS` を上表どおりに更新（既存 4 件を減点、新 2 件を追加）。
   - `THRESHOLDS` に `taskPlanning` / `oversizedToolResults` ブロックを追加。
2. `src/format.ts` の `RULE_LABELS` に追加:
   - `"task-planning": "タスクの計画"`
   - `"oversized-tool-results": "巨大なツール結果"`
3. `server/rules/index.ts` の `ALL_RULES` に登録:
   - `oversizedToolResultsRule` は productivity 群（`turnEfficiencyRule` の後）
   - `taskPlanningRule` は practice 群（`claudeMdPresentRule` の後）

### `oversized-tool-results` 固有

4. `shared/types.ts` の `SessionMetrics` に 3 フィールド追加
   （`parseErrors` の直前あたり、集計層の並びに合わせる）。
5. `server/metrics.ts`:
   - ローカル変数 `oversizedResults = 0` / `largestResultBytes = 0` /
     `largestResultTool: string | null = null` を宣言。
   - user イベントの `toolResults` ループ内で集計。
   - 返り値オブジェクトに 3 フィールドを追加。
6. `server/rules/testHelpers.ts` の `metricsFixture()` に
   `oversizedResults: 0` / `largestResultBytes: 0` / `largestResultTool: null` を追加。
7. `server/rules/oversizedToolResults.ts` を実装。

### `task-planning` 固有

8. `server/rules/taskPlanning.ts` を実装（メトリクス追加なし）。

### テスト

9. `server/rules/taskPlanning.test.ts`
   - 規模未満（`assistantTurns:10`）→ 判定対象外・満点
   - 規模充足・`TodoWrite` 使用あり → 満点
   - 規模充足・`TodoWrite` 使用なし → 0 点、`advice` が非 null
10. `server/rules/oversizedToolResults.test.ts`
    - `toolCalls:5` → 判定対象外・満点
    - `oversizedResults:0` → 満点
    - `oversizedResults:3` → 部分点（0 < score < 1）
    - `oversizedResults:6` → 0 点
    - `largestResultTool:null` のとき evidence が `（最大 …KB）` のみになる
11. `server/metrics.test.ts` に oversized 集計のケースを追加
    （12KB 超の tool_result を含むイベント列で `oversizedResults` /
    `largestResultBytes` / `largestResultTool` が期待どおりになる）。
12. `server/rules/index.test.ts` と `server/score.test.ts`:
    重み合計が 100 であるアサーションと、`ALL_RULES.length === 12` が通ること。
13. `npm run typecheck && npm test` の出力を確認して完了とする。

## 未解決事項

なし。閾値の初期値は実データから決定済み。実データを増やして再調整するのは
既存ルールと同じ運用で、本スペックの範囲外。
