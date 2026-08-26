# cinch

ローカルの Claude Code セッションログを解析し、セッション単位で「使い方」を採点する Web アプリ。
減点理由と改善アクションを提示して、自己改善のフィードバックループとして使う。

## 使い方

```bash
npm install
npm start
```

`http://localhost:5173` を開く。

## 動作の前提

- `~/.claude/projects/<エスケープされた cwd>/<sessionId>.jsonl` を読む。
- **読み取り専用。** ログへの書き込みは一切行わない。
- API サーバは `127.0.0.1:5174` にのみバインドする。セッションログには会話内容が
  含まれるため、外部からアクセスできる場所で待ち受けない。
- API 応答に会話の本文は含めない。数値・ツール名・モデル名のみを返す。
- LLM 呼び出しは行わない。判定は構造的な指標のみで、オフラインで完結する。
- 更新はバッチ読み取り。ファイル監視はしないので、再スキャンで反映する。

## スコアリング

3 カテゴリ、計 15 ルール、100 点満点。assistant ターンが 3 回未満のセッションは
採点対象外（一覧には出るがスコアは付かない）。

| カテゴリ | 配点 | ルール |
|---------|------|-------|
| コスト効率 | 35 | `cache-efficiency`(12) / `cache-ttl-waste`(10) / `model-fit`(8) / `context-window-headroom`(5) |
| 生産性 | 35 | `tool-error-rate`(9) / `redundant-file-reads`(6) / `parallel-tool-use`(6) / `turn-efficiency`(7) / `oversized-tool-results`(4) / `bash-over-native-tools`(3) |
| ベストプラクティス | 30 | `subagent-delegation`(7) / `context-growth`(8) / `claude-md-present`(4) / `task-planning`(4) / `verification-gap`(7) |

閾値はすべて `server/config/thresholds.ts` にある。実データを見て調整する前提の
初期値なので、感覚と合わなければここだけを触る（ルールのテストは壊れない）。

### 判定精度の制約

`parallel-tool-use` と `subagent-delegation` は、「そうすべきだった場面」を構造情報
だけでは確定できない。逐次実行されたツール呼び出しが本当に独立していたのかは
ログから判別できないため、**明らかに独立と分かるケース（読み取り専用ツールのみの
ターン）に限定して判定し、判定できないケースは減点しない**。誤検知で減点するより
検出漏れを許容するほうが、フィードバックツールとして信頼できるため。

## ルールを追加する

1. `server/rules/<name>.ts` に `Rule` を実装する（純粋関数）。
2. `server/config/thresholds.ts` の `WEIGHTS` に配点を足す。合計 100 を保つこと。
3. `server/rules/index.ts` の `ALL_RULES` に登録する。
4. `src/format.ts` の `RULE_LABELS` に日本語名を足す。

`evidence`（事実）と `advice`（改善案）はルール自身が持つ。「なぜ減点か」「どう直すか」
の説明責任をルールと同じ場所にまとめるため。

## 設計

データの流れは一方向。

```
discover.ts  →  parse.ts  →  metrics.ts  →  rules/*.ts  →  score.ts  →  api.ts
（fs に触る    （JSONL の     （数え上げ。    （1 ファイル   （重み付け   （2 つの
  唯一の層）    知識を閉じ     判断はしない）  1 ルール）     と合算）     endpoint）
                込める）
```

`metrics.ts` 以降はすべて純粋関数なので、ファイルシステムのモックなしでテストできる。
「ツールエラーが 3 件」は事実で `metrics.ts`、「3 件は多い」は判断で `rules/`。
この境界のおかげで、閾値を変えても `metrics.ts` のテストは壊れない。

## 開発

```bash
npm test          # Vitest
npm run typecheck # tsc --noEmit（フロント・サーバ両方）
npm run build     # 型チェック + Vite ビルド
```

## スコープ外（後から追加できる形にはしてある）

- ファイル監視によるリアルタイム更新（SSE / WebSocket）
- LLM による会話内容の定性評価
- テキスト内容の正規表現マッチによる手戻り検出
- グラフによる可視化（スコアの時系列推移）
- プロジェクト単位・期間横断の集約スコア
