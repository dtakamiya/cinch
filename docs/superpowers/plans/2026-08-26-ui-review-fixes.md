# cinch 利用レビュー 修正計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 利用者としてブラウザ操作したレビュー（2026-08-26 実施）で洗い出した不具合・UX 問題を修正する。フロント（`src/`）中心。データフロー境界（`discover → parse → metrics → rules → score → api`）は変更しない。

**背景:** レビューで確認した事実。

- 起動済みインスタンス（Vite :5173 / API :5174）に対しブラウザ操作で検証。
- パストラバーサル対策・`127.0.0.1` バインド・404 ハンドリングは正常。コンソールエラーなし。
- 一方で、下表の問題を確認した。

**Tech Stack:** TypeScript（フロント `tsconfig.json`, `moduleResolution: bundler`, jsx / サーバ `tsconfig.server.json`, `module: NodeNext`, 相対 import `.js` 付き）、React + Vite、Express 5、Vitest（デフォルト `node`、React テストはファイル先頭に `// @vitest-environment jsdom`）。

## Global Constraints

- **データフロー境界を守る。** fs に触るのは `discover.ts` / `analyze.ts` のみ。`metrics.ts` 以降は純粋関数。
- **API 応答に会話本文を含めない。** 追加してよいのは数値・ツール名・モデル名のみ。
- **API サーバは `127.0.0.1` にのみバインド。** `server/index.ts` の `listen` HOST を変更しない。
- **`src/` の純粋関数はUIを介さず直接テストする**（`format.ts` の整形、`SessionList.tsx` の `filterAndSort` など）。
- 既存の日本語UIコピー・トーンに合わせる。

## 問題一覧（優先度順）

| # | 種別 | 問題 | 対応タスク |
|---|------|------|-----------|
| 1 | 🔴 バグ | `npm start` 二重起動で API がポート衝突を握りつぶし `exited code 0`。`concurrently` は全体を落とさず、画面は出るが `/api` 不通。 | Task 1 |
| 2 | 🔴 バグ | モバイル幅（375px）で期間・並び順フィルタが画面右外に出て操作不能（`.filter-bar` が `flex-wrap: nowrap`）。 | Task 2 |
| 3 | 🔴 バグ | プロジェクト一覧が未正規化。`.claude` / 6桁ハッシュ（`039b22` 等）/ `f438b8` と `analyze-…-f438b8` のサフィックス重複が混在。約50項目がソートも甘い。 | Task 3 |
| 4 | 🟡 UX | 詳細画面にディープリンクなし。URL は `/` のまま、リロードで一覧に戻る、ブラウザバック不可、URL 共有不可。 | Task 4 |
| 5 | 🟡 UX | サマリー（平均スコア / 採点済 N件）がフィルタに追従せず常に全体値。 | Task 5 |
| 6 | 🟡 UX | 所要時間の異常値をそのまま表示（例「75時間33分」＝セッション放置）。 | Task 6 |
| 7 | 🟡 UX | 詳細画面の3カラムが狭く日本語が1〜3文字で折り返す（「キャッシュ / 効率」）。狭幅で1カラムに落ちない。 | Task 7 |
| 8 | 🟡 UX | 詳細3カラムの高さ不揃いで右カラム下に大きな空白。 | Task 7 |
| 9 | 🟡 UX | 採点対象外 48/258 件がスコア順末尾に積まれ、全件を仮想化なしで1ページ描画（ページ高 ~27,700px）。 | Task 8 |
| 10 | 🟢 軽微 | モバイルでサマリー文言「全258件」が「全258 / 件」で改行。 | Task 2 に含める |

---

## Task 1: `npm start` のポート衝突を fatal にする

**問題:** `concurrently` が API プロセスの異常終了を検知せず全体が生き続ける。ポート使用中でも Vite は別ポートへ退避し、利用者は API 不通に気づけない。

**対応:**

- [ ] `package.json` の `start` スクリプトに `concurrently` の `--kill-others-on-fail` を付ける（どちらか一方が非0終了したら全体停止）。
- [ ] `server/index.ts` の `listen` に `error` ハンドラを追加し、`EADDRINUSE` のとき `console.error` で「ポート <port> は使用中です。既存の cinch が起動していないか確認してください。」を出力して `process.exit(1)`。
      - fs に触らない・HOST 引数は変えない。`app.listen(PORT, "127.0.0.1", cb).on("error", handler)` の形。
- [ ] `vite.config.ts` に `server.strictPort: true` を設定し、ポート衝突時に Vite も黙って退避せず失敗させる。
- [ ] 手動確認: 2つのターミナルで `npm start` を実行し、2つ目が即座にエラー終了して全体が止まることを確認。

**検証:**

```bash
npm start        # 1つ目（別ターミナルで起動中の想定）
npm start        # 2つ目 → EADDRINUSE で exit 1、concurrently が全体停止
```

---

## Task 2: フィルタバーをモバイルで折り返す

**問題:** `.filter-bar` が `display:flex; flex-wrap:nowrap; overflow:auto`。375px 幅ではプロジェクトセレクトだけで ~441px を占有し、期間・並び順が画面右外。タッチ環境ではスクロールバーが出ず到達不可。

**対応:**

- [ ] `src/` の該当 CSS（`.filter-bar`）を `flex-wrap: wrap` にし、各フィルタ（`label` 単位）に `min-width` を与えて折り返し時に潰れないようにする。`overflow: auto` は不要なら外す。
- [ ] プロジェクトセレクトの `max-width` を画面幅内に収める（`max-width: 100%` もしくは `min(100%, 28rem)`）。長いプロジェクト名で横スクロールが出ないこと。
- [ ] サマリーの「全258件」が改行で割れないよう、当該表記を1つの要素にまとめるか `white-space: nowrap` を当てる。
- [ ] 確認: 375 / 768 / 1024 / デスクトップ幅で、プロジェクト・期間・並び順の3コントロールすべてがビューポート内に見え操作できること。

**検証:** ブラウザ幅を変えて目視。`filterAndSort` のロジック変更はないためユニットテストは既存のまま。

---

## Task 3: プロジェクト名の抽出・正規化

**問題:** プロジェクト一覧に生の cwd 断片が漏れている。

- `.claude`（`~/.claude` 直下のセッション）
- 6桁16進ハッシュ（`039b22`, `05f4bb`, `0a9ed0`, `170eab`, `51dced`, `5a1321`, `6594d4`, `9b7824`, `c4f3a9`, `d17a22`, `f438b8`）
- サフィックス重複（`f438b8` と `analyze-claude-cookbooks-f438b8`、`170eab` と `haiku-model-usage-170eab`、`05f4bb` と `requirements-to-implementation-harness-05f4bb`、`0a9ed0` と `token-reduction-strategies-0a9ed0`、`6594d4` と `project-improvement-ideas-6594d4`、`c4f3a9` と `question-bank-update-c4f3a9`）

**原因調査:**

- [ ] `server/discover.ts` の `projectName` 導出ロジックを確認する（cwd から `path.basename` している想定）。`~/.claude/projects/<エスケープ済み cwd>/` のディレクトリ名を復元する際に、末尾ハッシュ（Claude Code が cwd 重複時に付けるサフィックス）を分離できていないと推測。
- [ ] 実データで、上記ハッシュがどのセッションの cwd に対応するか `curl -s http://localhost:5174/api/sessions | jq '[.[] | {projectName, cwd}] | unique_by(.cwd)'` で確認。

**対応方針（調査結果を見て確定）:**

- [ ] `projectName` は cwd の最終セグメントから、Claude Code が付ける `-<6〜8桁hex>` サフィックスを剥がした値にする。剥がした結果が空 or ハッシュそのものなら、親ディレクトリ名にフォールバック（`cost/dashboad` → `dashboad` など既存挙動は維持）。
- [ ] `.claude` 配下のセッションは `projectName` を `".claude"` のままにするか、除外するか要判断 → **一覧には出すが名前は `~/.claude` と表示**（ユーザーがグローバル設定をいじったセッションと分かるように）。
- [ ] ロジックは `discover.ts` 内の純粋関数に切り出し（`deriveProjectName(cwd: string): string`）、`server/discover.test.ts` にケースを追加:
      - `/Users/x/work/cinch` → `cinch`
      - `/Users/x/work/cc/cost/dashboad` → `dashboad`
      - `/Users/x/.claude` → `~/.claude`
      - サフィックス付き cwd（実データで確認したもの）→ ベース名
- [ ] `src/SessionList.tsx` の `projects` の `useMemo`（重複排除＋ソート）で、`localeCompare` によるソートを確認。大小混在が気になるなら `sensitivity: "base"` を指定。

**注意:** これは `discover.ts`（fs 層）の変更。`metrics.ts` 以降には影響させない。API レスポンスの `projectName` フィールドの型は変えない。

**検証:**

```bash
npx vitest run server/discover.test.ts
npm run typecheck
```

---

## Task 4: 詳細画面のディープリンク

**問題:** セッション詳細に遷移しても URL は `/`。リロード・ブラウザバック・URL 共有ができない。カードが `<button>` + JS 遷移。

**対応:**

- [ ] ルーティングを導入する。依存を増やさない方針なら `window.location.hash`（`#/session/<id>`）ベースの最小ルーターを `src/` に自作。react-router を入れる場合は `package.json` へ追加し理由をコミットメッセージに明記。**推奨: hash ベースの自作**（SPA、API は別プロセス、デプロイ形態が固定のため）。
- [ ] `App`（もしくは最上位）で `hashchange` を購読し、`#/session/:id` なら詳細、それ以外は一覧を描画。
- [ ] 一覧のセッションカードを `<a href="#/session/<id>">` にする（`<button>` + `onClick` をやめる）。`session-card--ungraded` は従来どおり非リンク `<div>`。
- [ ] 「一覧に戻る」は `<a href="#/">` に。
- [ ] 詳細画面で不正 ID（存在しない）の場合、既存の 404 表示に加えて「一覧に戻る」導線を出す。
- [ ] キーボード操作: カードが `<a>` になることで Tab フォーカス・Enter 遷移が標準で効く。フォーカスリングの CSS を確認。
- [ ] 確認: 詳細を開く → リロードで同じ詳細が復元 → ブラウザバックで一覧 → URL をコピーして新規タブで開ける。

**検証:** `src/` の hash パース関数（`parseRoute(hash: string)`）を jsdom なしの純粋関数として `src/route.test.ts` でテスト。

---

## Task 5: サマリーをフィルタに追従させる

**問題:** ヘッダーの「平均スコア」「採点済 N件 / 全M件」がプロジェクト・期間フィルタを無視して常に全体値。

**対応:**

- [ ] `src/SessionList.tsx`（or サマリーを描画しているコンポーネント）で、サマリーの集計対象を「フィルタ後の行（`rows`）」に切り替える。
      - 平均スコア = フィルタ後の `gradable` セッションの `total` 平均。
      - 採点済 = フィルタ後の `gradable` 件数、全 = フィルタ後の総件数。
- [ ] フィルタ未適用（プロジェクト「すべて」かつ期間「すべて」）のときは従来と同じ数字になること。
- [ ] ラベルを実態に合わせる（フィルタ時は「絞り込み結果の平均」等の副題を小さく添えると親切、任意）。
- [ ] 集計関数を純粋関数に切り出して `src/` でテスト（`summarize(rows): { avg, graded, total }`）。0件時に `NaN` を出さない。

**検証:** `npx vitest run src/` の該当テスト。

---

## Task 6: 所要時間の異常値対策

**問題:** `durationMs` が実時間の差分をそのまま持つため「75時間33分」のような値が表示される（セッションを開きっぱなしにしたケース）。

**対応:**

- [ ] `src/format.ts` の時間整形関数を確認。しきい値（例: 24時間）を超えたら `"24時間+"` と表示、もしくは実値の後ろに注記を付ける方針を選ぶ。**推奨: `"1日+"` 相当のクランプ表示**（利用者に無意味な精度を見せない）。しきい値の数値リテラルは `src/` 側の定数にまとめる（`thresholds.ts` はサーバ採点用なので混ぜない）。
- [ ] `metrics.ts` / `parse.ts` / API は変更しない（表示層だけの問題）。採点ロジックは実 `durationMs` を使い続ける。
- [ ] `format.ts` のユニットテストに、境界値（23:59、24:00、100時間、負値・0）を追加。

**検証:** `npx vitest run src/format.test.ts`

---

## Task 7: 詳細画面のレイアウト

**問題:** 3カラム固定で各カラム ~200px。日本語見出しが「コンテキス / トの肥大」のように折れる。さらにカラムの高さが不揃いで右カラム下に大きな空白。

**対応:**

- [ ] 詳細画面のカテゴリ3カラムを、レスポンシブグリッドにする（`grid-template-columns: repeat(auto-fit, minmax(<Npx>, 1fr))`）。狭幅（〜720px 目安）では1カラムに落ちること。
- [ ] ルール見出し（`キャッシュ効率` 等）が折り返さない最小幅を確保。折れる場合でも単語境界を尊重（`word-break: keep-all` / `overflow-wrap: anywhere` の使い分けを日本語で検証）。
- [ ] 高さ不揃いは、カラム単位ではなくルールカード単位のグリッド（各カテゴリを1ブロックにまとめ、ブロックを `align-self: start`）にして空白を詰める。
- [ ] スコアバー（`30.7 / 35` の進捗バー）の桁が右端で切れないこと。
- [ ] 確認: 375 / 768 / 1024 / 1440 幅で見出しが読める・空白が過大でない。

**検証:** ブラウザ目視。ロジック変更なし。

---

## Task 8: 採点対象外セッションの扱いとリスト仮想化

**問題:** 258 件中 48 件が採点対象外（0〜2ターン）。スコア順で末尾に大量に積まれ、全件を仮想化なしで1ページ描画（ページ高 ~27,700px）。スクロール・ページ内検索が重い。

**対応:**

- [ ] フィルタバーに「採点対象外を表示」トグル（デフォルト OFF）を追加。`src/SessionList.tsx` の `filterAndSort` に `showUngraded: boolean` を渡し、OFF なら `gradable === false` を除外。
      - 件数表示（`N セッション`）はトグル状態を反映。
- [ ] リスト仮想化を入れる。依存を増やさない方針なら Intersection Observer による簡易 windowing、もしくは `content-visibility: auto` + `contain-intrinsic-size` を各カードに当てる（**推奨: まず `content-visibility: auto`**。実装が軽く、258 件程度なら十分）。効果が不足するライブラリ導入を検討。
- [ ] 日付欠落セッション（`startedAt` が無く時刻が `─` 表示）の扱いを確認。トグル OFF で基本的に視界から消えるが、表示時のプレースホルダは現状維持で可。
- [ ] `filterAndSort` のテストに `showUngraded` のケースを追加。

**検証:**

```bash
npx vitest run src/           # filterAndSort のテスト
```
ブラウザで、トグル OFF 時にページ高が大幅に縮むこと・スクロールが軽くなることを目視。

---

## 実装順の推奨

1. **Task 1**（起動事故の再発防止。以降の検証を安定させる）
2. **Task 3**（プロジェクト正規化。fs 層で独立、テストしやすい）
3. **Task 4**（ディープリンク。以降のUI変更の土台）
4. **Task 2 / Task 7**（CSS レスポンシブ、まとめて確認）
5. **Task 5 / Task 6 / Task 8**（表示層の改善、相互依存なし・並列可）

## 完了条件

- [ ] `npm test` 全パス
- [ ] `npm run typecheck` パス（フロント・サーバ両方）
- [ ] 375 / 768 / 1024 / 1440 幅で一覧・詳細が破綻なく操作できる
- [ ] 詳細画面の URL がリロード・共有で復元できる
- [ ] `npm start` の二重起動が即座にエラー終了する
- [ ] プロジェクトフィルタにハッシュ断片・重複が出ない
