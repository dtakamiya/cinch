# cinch 設計書

作成日: 2026-08-25

## 概要

ローカルの Claude Code セッションログを解析し、セッション単位で「使い方」を採点する Web アプリ。減点理由と改善アクションを提示し、自己改善のフィードバックループとして機能させる。

## 要件

| 項目 | 決定内容 |
|------|----------|
| 目的 | 自己改善のフィードバックループ。スコアの各項目は減点理由と改善アクションに紐づく |
| 採点単位 | セッション単位。一覧で比較できる |
| 判定方法 | 構造的な指標のみ。決定論的でオフライン完結。LLM 呼び出しもテキスト内容のパターンマッチも行わない |
| 更新方式 | バッチ読み取り。ファイル監視は行わず、リロードで更新する |
| 技術スタック | 全面 TypeScript。バックエンド Node + Express、フロントエンド React + Vite、テスト Vitest |

### スコープ外

以下は初期実装に含めない。設計上、後から追加できる形にはしておく。

- ファイル監視によるリアルタイム更新（SSE / WebSocket 配信）
- LLM による会話内容の定性評価
- テキスト内容の正規表現マッチによる手戻り検出
- グラフによる可視化（スコアの時系列推移など）
- プロジェクト単位・期間横断の集約スコア（セッション単位の積み上げで後から算出可能）

## データソース

`~/.claude/projects/<エスケープされた cwd>/<sessionId>.jsonl`

1 行 1 イベントの JSONL。読み取り専用でアクセスし、書き込みは一切行わない。

利用するフィールド:

| フィールド | 用途 |
|-----------|------|
| `type` | イベント種別の判別（`user` / `assistant` / `mode` / `permission-mode` など） |
| `message.model` | モデル別集計、`model-fit` ルール |
| `message.usage` | トークン集計、キャッシュ効率、コンテキスト肥大の判定 |
| `message.usage.cache_creation.ephemeral_1h_input_tokens` | 1h キャッシュの失効判定 |
| `message.content[]` の `tool_use` | ツール呼び出しの数え上げ、並列化判定 |
| `message.content[]` の `tool_result` | ツールエラー率（`is_error`）、出力サイズ |
| `timestamp` | セッション時間、ターン間隔 |
| `isSidechain` | サブエージェント委譲の判別 |
| `cwd` | プロジェクト特定、CLAUDE.md の存在確認 |
| `version`, `gitBranch` | メタ情報の表示 |

## アーキテクチャ

```
~/.claude/projects/<escaped-cwd>/<sessionId>.jsonl   ← データソース（読み取り専用）
          │
          ▼
┌─────────────────────────────────────────┐
│ server/ (Node + Express, TypeScript)     │
│                                          │
│  discover.ts  JSONL ファイルの列挙        │
│       ↓                                  │
│  parse.ts     1 行 → 正規化イベント       │
│       ↓                                  │
│  metrics.ts   イベント列 → セッション指標  │
│       ↓                                  │
│  rules/       指標 → 個別ルールの判定      │
│       ↓                                  │
│  score.ts     判定結果 → スコア + 改善案   │
│       ↓                                  │
│  api.ts       GET /api/sessions           │
└─────────────────────────────────────────┘
          │  JSON
          ▼
┌─────────────────────────────────────────┐
│ src/ (React + Vite, TypeScript)          │
│  一覧（ソート / フィルタ） → 詳細（減点内訳）│
└─────────────────────────────────────────┘
```

データの流れは一方向。各段の責務:

| モジュール | 入力 | 出力 | 責務 |
|-----------|------|------|------|
| `discover.ts` | ディレクトリパス | ファイルパス[] | ファイルシステムに触る唯一の場所 |
| `parse.ts` | JSONL 1 行の文字列 | `Event \| null` | JSONL スキーマの知識を閉じ込める |
| `metrics.ts` | `Event[]` | `SessionMetrics` | 数え上げ。判断はしない |
| `rules/*.ts` | `SessionMetrics` | `RuleResult` | 1 ファイル 1 ルール。純粋関数 |
| `score.ts` | `RuleResult[]` | `SessionScore` | 重み付けと合算 |

### 分割方針の根拠

`metrics.ts` は「数える」だけで「良し悪しを判断しない」。「ツールエラーが 3 件」は事実、「3 件は多い」は判断であり、前者を `metrics.ts`、後者を `rules/` に置く。これにより閾値を変更してもルールだけを触れば済み、`metrics.ts` のテストは壊れない。

`metrics.ts` 以降はすべて純粋関数のため、ファイルシステムのモックなしでテストできる。

### ルールのプラグイン形式

```ts
interface Rule {
  id: string;                  // "high-tool-error-rate"
  category: Category;          // "cost" | "productivity" | "practice"
  weight: number;              // 配点
  evaluate(m: SessionMetrics): RuleResult;
}

interface RuleResult {
  score: number;               // 0.0〜1.0（1.0 が満点）
  evidence: string;            // "ツール呼び出し47回中12回が失敗（25.5%）"
  advice: string | null;       // 満点なら null
}
```

ルール追加は「`rules/` にファイルを 1 つ作り、レジストリに登録する」だけ。`evidence`（事実）と `advice`（改善案）をルール自身が持つことで、「なぜ減点か」「どう直すか」の説明責任がルールと同じ場所にまとまる。

## スコアリングルール

3 カテゴリ、計 9 ルール、100 点満点。カテゴリごとの小計も算出し、「コストは良いが生産性が低い」といった診断を可能にする。

### コスト効率（35 点）

| ID | 配点 | 何を見るか | 満点条件 / 減点 |
|----|------|-----------|----------------|
| `cache-efficiency` | 15 | `cache_read / (cache_read + input + cache_creation)` | ヒット率が高いほど高得点。低い＝毎ターン文脈を再送している |
| `cache-ttl-waste` | 10 | 1h キャッシュ作成後、TTL 内に再利用されず失効した回数 | 失効 0 で満点。1h 作成は 5m 比で割高なので、使い切れないなら損 |
| `model-fit` | 10 | 単純作業（Read/Grep/Bash のみで完結したターン）に高コストモデルを使った割合 | 低いほど高得点 |

### 生産性（35 点）

| ID | 配点 | 何を見るか | 満点条件 / 減点 |
|----|------|-----------|----------------|
| `tool-error-rate` | 12 | `tool_result.is_error` の全ツール呼び出しに対する比率 | 5% 未満で満点、25% 超で 0 点 |
| `redundant-file-reads` | 8 | 同一ファイルを編集を挟まず 2 回以上 Read した回数 | 0 回で満点。読み直し＝文脈を捨てている |
| `parallel-tool-use` | 8 | 独立したツール呼び出しが 1 メッセージにまとめられている割合 | 逐次実行が多いと減点。往復回数がそのまま待ち時間になる |
| `turn-efficiency` | 7 | 1 セッションあたりの assistant ターン数と出力トークンの比 | 極端に多い＝空回りの兆候 |

### ベストプラクティス遵守（30 点）

| ID | 配点 | 何を見るか | 満点条件 / 減点 |
|----|------|-----------|----------------|
| `subagent-delegation` | 12 | 大量出力を伴う探索をメインで直接行っているか、`isSidechain` に委譲しているか | 委譲されていれば加点 |
| `context-growth` | 10 | セッション中の `cache_read + input` の増加カーブ | 単調増加が急なら減点。肥大を放置している |
| `claude-md-present` | 8 | セッションの `cwd` に CLAUDE.md が存在するか | 存在すれば満点 |

### 採点方針

**絶対評価を採用する。** 相対評価（他セッションとの比較順位）ではなく固定閾値で採点する。目的が自己改善であるため、相対評価では全セッションが改善しても平均点が動かず、フィードバックとして機能しないため。

**閾値は `config/thresholds.ts` に集約する。** 「エラー率 25% で 0 点」などの数値は初期値であり、実データを見て調整することを前提とする。ルールのロジックと数値を分離することで、チューニング時にテストが壊れない。

**短いセッションは採点対象外とする。** assistant ターンが 3 未満のセッションは `gradable: false` とし、一覧には表示するがスコアを付けない。1 往復のセッションでキャッシュ効率を論じても意味がなく、ノイズになるため。

**`claude-md-present` のみファイルシステムを参照する。** 他のルールと異なりセッションログ外の情報を使う。`metrics.ts` の純粋性を保つため、cwd の存在確認は `discover.ts` 側で実施し、`SessionMetrics` には真偽値として渡す。

### 判定精度に関する既知の制約

`parallel-tool-use` と `subagent-delegation` は、「そうすべきだった場面」の判定が構造情報だけでは確定できない。逐次実行されたツール呼び出しが本当に独立していたのか、依存関係があったのかはログから判別できないため。

**方針: 明らかに独立と分かるケース（同種の読み取り専用ツールの連続）に限定して判定し、判定できないケースは減点しない（満点扱いとする）。** 誤検知で減点するより検出漏れを許容するほうが、フィードバックツールとしての信頼性が保てるため。

## データモデル

`shared/types.ts` に定義し、サーバとフロントで共有する。

```ts
// パース層: JSONL 1 行の正規化結果
type Event =
  | { kind: "user";      ts: string; toolResults: ToolResult[] }
  | { kind: "assistant"; ts: string; model: string; effort: string | null;
      usage: Usage; toolUses: ToolUse[]; isSidechain: boolean }
  | { kind: "meta";      ts: string | null; cwd: string; version: string;
                         gitBranch: string | null; permissionMode: string | null };

interface ToolUse    { id: string; name: string; input: unknown }
interface ToolResult { toolUseId: string; isError: boolean; byteLength: number }
interface Usage {
  input: number; output: number;
  cacheCreate: number; cacheCreate1h: number; cacheCreate5m: number | null;
  cacheRead: number;
}

// 集計層: 数え上げの結果（判断を含まない）
interface SessionMetrics {
  sessionId: string;
  cwd: string;
  projectName: string;              // cwd の basename
  startedAt: string;
  endedAt: string;
  durationMs: number;
  assistantTurns: number;
  models: Record<string, number>;   // モデル名 → ターン数
  totals: Usage;                    // セッション合計
  toolCalls: number;
  toolErrors: number;
  toolsByName: Record<string, { calls: number; errors: number }>;
  redundantReads: number;
  parallelizableSequences: number;  // 並列化できたはずの逐次実行
  sidechainTurns: number;
  contextGrowth: number[];          // ターンごとの累積入力トークン
  cacheExpirations: number;
  hasClaudeMd: boolean;
  gitBranch: string | null;
  version: string;
  parseErrors: number;
}

// 採点層
interface SessionScore {
  sessionId: string;
  total: number;                    // 0-100
  gradable: boolean;                // assistantTurns >= 3
  categories: Record<Category, { earned: number; max: number }>;
  rules: EvaluatedRule[];
}

interface EvaluatedRule {
  id: string; category: Category;
  earned: number; max: number;
  evidence: string;
  advice: string | null;
}
```

`Event` は判別可能ユニオンとし、`kind` による分岐で型が絞られるようにする。JSONL の生の構造（`message.usage.cache_creation.ephemeral_1h_input_tokens` のようなネスト）はパース層で平坦化し、以降は `Usage` のみを扱う。生スキーマの知識を `parse.ts` の外に漏らさないことで、ログ形式の変更時の修正範囲を 1 ファイルに閉じ込める。

## API

エンドポイントは 2 つ。

```
GET /api/sessions
  → { sessions: SessionSummary[], scannedAt: string, projectCount: number,
      skipped: { path: string, reason: string }[] }
     SessionSummary = セッションのメタ情報 + SessionScore（rules の evidence/advice は除く）

GET /api/sessions/:sessionId
  → { metrics: SessionMetrics, score: SessionScore }   // rules 全量を含む
```

一覧では重い詳細（ルールごとの evidence 文字列）を返さず、詳細を開いたときに取得する。

**解析自体は一覧のリクエスト時に全セッション分を実行する。** 一覧のソート順がスコアに依存するため、結局全件の採点が必要になるため。解析結果はプロセス内にメモリキャッシュし、ファイルの mtime が変化したものだけ再解析する。

## 画面

### 一覧画面

```
┌──────────────────────────────────────────────────────┐
│ cinch          [プロジェクト ▾] [期間 ▾]  再スキャン  │
├──────────────────────────────────────────────────────┤
│ 平均 68点   採点済 142件 / 全187件                    │
├──────────────────────────────────────────────────────┤
│ スコア │ プロジェクト │ 開始時刻 │ ターン │ 主な減点  │
│  ▁▃▅ 42│ cinch        │ 8/24 14:03│  38   │ ツールエラー│
│  ▁▅█ 71│ cc-cost-dash │ 8/23 09:11│  22   │ キャッシュ  │
│  ▃██ 89│ ai-secretary │ 8/22 16:40│  15   │ —          │
└──────────────────────────────────────────────────────┘
```

スコア列でソート、プロジェクトと期間でフィルタ。「主な減点」列に最大減点ルールを表示し、一覧の時点で改善の方向が見えるようにする。

### 詳細画面

セッション 1 件のカテゴリ別スコアと、ルールごとの内訳。減点のあるルールを上に並べ、各行に evidence（事実）と advice（改善案）を表示する。

```
生産性  18 / 35
 ✗ ツールエラー率        2/12   47回中12回が失敗（25.5%）
    → Bashの引数を実行前に確認してください。特にfindの…
 ✗ 冗長なファイル読み込み  3/8    同一ファイルを5回再読み込み
    → …
 ✓ 並列ツール呼び出し     8/8    独立した呼び出しは並列化されています
```

グラフは初期スコープ外。カテゴリ別スコアは 3 項目のため数値とバーで十分読める。時系列推移は採点の正しさを確認した後の拡張とする。

## エラーハンドリング

原則: **部分的な失敗で全体を落とさない。** ログは自プロジェクトが生成したものではなく形式が変わりうるため、厳格にパースして落ちるより、読めた分だけ採点して読めなかった件数を正直に提示する。

| 事象 | 扱い |
|------|------|
| JSONL の 1 行がパース不能 | その行をスキップし、セッションの `parseErrors` に計上。セッション全体は破棄しない |
| ファイル全体が読めない | そのファイルをスキップし、API 応答の `skipped[]` に理由付きで含める。UI に件数を表示 |
| `~/.claude/projects` が存在しない | 空配列と明示的なメッセージを返す（500 にしない） |
| 未知の `type` の行 | 無視する。ログ形式の追加に対して前方互換とする |

## テスト方針

| 対象 | 方針 |
|------|------|
| `parse.ts` | 実ログから採取した各パターンの 1 行を固定値でテスト |
| `metrics.ts` | 手で組んだ `Event[]` を入力に、数え上げの正しさを検証 |
| `rules/*.ts` | 各ルールに境界値テスト（閾値ちょうど、その上、その下） |
| `score.ts` | 配点合計が 100 であること、カテゴリ小計の整合性 |
| API | supertest で 200 応答と応答スキーマを検証 |

`metrics.ts` 以降はすべて純粋関数のため、ファイルシステムのモックを必要としない。

## セキュリティ / プライバシー

- セッションログには会話内容が含まれるため、**サーバはローカルホストのみにバインドする**（`127.0.0.1`）。
- API 応答に会話の本文を含めない。`metrics` は数値とツール名のみを保持し、プロンプトや応答テキストは集計後に破棄する。
- `~/.claude/projects` に対する書き込みは行わない。
