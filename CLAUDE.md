# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

cinch は、ローカルの Claude Code セッションログ（`~/.claude/projects/<エスケープ済み cwd>/<sessionId>.jsonl`）を
解析し、セッション単位で「使い方」を 100 点満点で採点する Web アプリ。減点理由と改善アクションを提示する
フィードバックループとして使う。React フロント + Express API の 2 プロセス構成。

## コマンド

```bash
npm start          # API(tsx) と Vite を concurrently で同時起動。http://localhost:5173
npm run dev        # Vite のみ
npm run dev:server # API のみ（tsx watch）

npm test           # Vitest（vitest run）
npm run typecheck  # tsc --noEmit をフロント(tsconfig.json)・サーバ(tsconfig.server.json)両方
npm run build      # tsc -p tsconfig.server.json && vite build
```

単一テストの実行:

```bash
npx vitest run server/rules/cacheEfficiency.test.ts
npx vitest run -t "キャッシュヒット率"   # テスト名で絞り込み
```

## アーキテクチャ

### データフローは一方向・単一方向

```
discover.ts → parse.ts → metrics.ts → rules/*.ts → score.ts → api.ts
（fs に触る   （JSONL の    （数え上げ。   （1 ファイル   （重み付け    （2 endpoint）
  唯一の層）   知識を閉じ    判断はしない）  1 ルール）     と合算）
              込める）
```

**この境界を守ること。** 特に:

- **fs に触るのは `discover.ts` と `analyze.ts`（`readFile`）だけ。** `metrics.ts` 以降はすべて純粋関数で、
  ファイルシステムのモックなしでテストできる。`hasClaudeMd()` のようなファイル確認は `discover.ts` 側で
  実行して結果（boolean）だけを `metrics.ts` に渡す。
- **`metrics.ts` は「事実」だけを数える。良し悪しの判断をしない。** 「ツールエラーが 3 件」は事実 → `metrics.ts`、
  「3 件は多い」は判断 → `rules/`。この分離のおかげで、閾値を変えても `metrics.ts` のテストは壊れない。
- **数値リテラルをルール実装に直接書かない。** すべての閾値は `server/config/thresholds.ts` に集約する。
- **`parse.ts` は JSONL の生の構造を外に出さない。** `message.usage` の入れ子などはここで `Usage` 型に平坦化する。
  未知の `type` は前方互換のため null を返してスキップ（エラーに数えない）。JSON として読めない行だけ `parseErrors` に数える。

### 採点モデル

3 カテゴリ（`cost` / `productivity` / `practice`）、計 15 ルール、100 点満点。
`WEIGHTS`（`thresholds.ts`）の合計は常に 100 を保つ。assistant ターンが `minGradableTurns`(3) 未満の
セッションは `gradable: false`（一覧には出るがスコアなし）。

各 `Rule` は純粋関数 `evaluate(m: SessionMetrics): RuleResult` で、`score`(0〜1) と
`evidence`（減点の根拠＝事実）と `advice`（改善案、満点なら null）を返す。
「なぜ減点か」「どう直すか」の説明責任をルールと同じ場所に置く設計。
`score.ts` が `weight * score` で重み付けし、減点の大きい順に並べる。

### 判定精度の方針（重要）

`parallel-tool-use` と `subagent-delegation` は「そうすべきだった場面」を構造情報だけでは確定できない。
**明らかに独立と分かるケース（読み取り専用ツールのみのターン）に限定して判定し、判定できないケースは
減点しない。** 誤検知で減点するより検出漏れを許容する（`perfect()` を返して「判定対象外」とする）。
多くのルールに `minCalls` / `minOpportunities` / `minTurns` のような「サンプルが少なければ判定しない」閾値がある。

### セキュリティ・プライバシー制約

- **API サーバは `127.0.0.1` にのみバインドする。** `server/index.ts` の `listen` 第 2 引数の HOST を
  省略・変更しないこと。セッションログには会話本文が含まれる。
- **API 応答に会話本文を含めない。** 数値・ツール名・モデル名のみ。`SessionMetrics` / `SessionScore` に
  テキスト本文を足さない。`parse.ts` はツール結果の中身を保持せずバイト長だけ数える。
- **ログは読み取り専用。** 書き込み系の fs API を使わない。
- **パストラバーサル対策:** `/api/sessions/:sessionId` は sessionId をパスに連結せず、解析済み一覧から一致を探す。
- LLM 呼び出しはしない。判定は構造的な指標のみ、オフライン完結。

## ルールを追加する手順

1. `server/rules/<name>.ts` に `Rule` を実装（純粋関数）。`evidence` と `advice` を持たせる。
2. `server/config/thresholds.ts` の `WEIGHTS` に配点を追加。**合計 100 を保つ**（既存の配点を調整する）。
3. `server/rules/index.ts` の `ALL_RULES` に登録。
4. `src/format.ts` の `RULE_LABELS` に日本語名を追加。

## モジュール構成の型・実行環境の違い

- **フロント（`src/`, `shared/`）:** `tsconfig.json`。`moduleResolution: bundler`、jsx。Vite がバンドル。
- **サーバ（`server/`, `shared/`）:** `tsconfig.server.json`。`module: NodeNext`。相対 import は `.js` 拡張子付きで書く
  （`import { x } from "./api.js"` のように。実体は `.ts`）。
- `shared/types.ts` は両方から参照される。パース層 → 集計層 → 採点層 → API 層の順に型が定義されている。
- `verbatimModuleSyntax` が有効なので、型のみの import は `import type` を使う。
- `noUncheckedIndexedAccess` が有効。配列・Record のインデックスアクセスは `undefined` チェックが要る。

## テスト

- Vitest。デフォルト環境は `node`（サーバテストが多数派のため）。`src/` の React テストは
  ファイル先頭に `// @vitest-environment jsdom` ディレクティブを書く（vitest 4 で `environmentMatchGlobs` が削除された）。
- ルールのテストは `server/rules/testHelpers.ts` の `metricsFixture()` を使い、関心のあるフィールドだけ上書きする。
- `src/` の純粋関数（`format.ts` の整形、`SessionList.tsx` の `filterAndSort`）は UI を介さず直接テストする。
- API テストは `createApp({ root })` にテスト用ディレクトリを渡して supertest で叩く（`listen` はしない）。

## 参考

設計の詳細は `docs/superpowers/specs/2026-08-25-cinch-design.md`、実装計画は
`docs/superpowers/plans/2026-08-25-cinch.md`。閾値の初期値は実データを見て調整する前提。
