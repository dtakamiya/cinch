# cinch のドッグフーディング運用

cinch 自身の開発セッション（このリポジトリでの Claude Code 作業）を cinch で採点し、
「自己改善のフィードバックループ」（README 冒頭）を開発チーム自身に対して実践するための運用手順。

対応チケット: cinch-010（product-backlog.json）。

## 1. 週次スコアリング

- **頻度**: 週次（目安: 金曜のスプリントレビュー前、または区切りの良い作業のまとまりごと）。
- **手順**:
  1. `npm start` で Web UI を起動する（`http://localhost:5173`）。
  2. セッション一覧を `projectName` でこのリポジトリ（cinch）に絞り込む。
  3. 直近1週間に追加されたセッションを確認し、各セッションの総合スコアと上位の減点項目（`evidence` / `advice`）を控える。
     `gradable: false`（assistant ターン3回未満）のセッションは母集団に含めない。
  4. 結果を `docs/dogfooding-log.md` に追記する（フォーマットは同ファイル参照）。
- 集団統計（分布・ルール別発火率）が必要な場合は `npm run threshold-report -- --project cinch --since <日付>` を使う。
  これは個別セッションの代わりにはならない（週次の一次記録は Web UI での個別確認が前提）。

## 2. 減点項目の仕分けルール

各セッションの減点項目ごとに、以下のどちらかに仕分ける。

### (a) 実際に非効率だった

- 減点の根拠（`evidence`）が実際のセッションの挙動を正しく捉えており、次回の作業で回避可能なもの。
- 対応: `dogfooding-log.md` に記録するのみでよい。次回の開発時にその非効率を避けるよう意識する。
  cinch のルール・閾値・product-backlog への追加起票は不要。

### (b) cinch の見逃し / 誤検知

- **見逃し**: 明らかに非効率な挙動があったのに、どのルールも減点していない、または減点が実態より明らかに小さい。
- **誤検知**: 減点されたが、実際には妥当な行動だった（cinch 側の判定条件が実態に合っていない）。
  例: `subagent-delegation` や `parallel-tool-use` のように「明らかに独立と分かるケースに限定して判定する」
  （CLAUDE.md「判定精度の方針」）方針のため、判定条件の詰めが甘い場合に誤検知/見逃しが起きやすい。
- 判断に迷う場合は「その減点・その無減点を、cinch の設計方針（判定精度の方針・スコープ外セクション）に照らして
  説明できるか」を基準にする。説明できなければ (b) 扱いとする。
- 対応: 3節の手順で product-backlog に起票する。

## 3. 見逃し / 誤検知の起票手順

`~/.ryoko/org/scrum-team/product-backlog.json` に `cinch-NNN` として起票する
（採番規則は `~/.ryoko/knowledge/cinch-board-conventions.md` に従う。ゼロ埋め3桁、欠番禁止）。

- `title`: 見逃し・誤検知の内容を簡潔に（例: 「`tool-error-rate` が n 件連続の再試行を過小評価している」）
- `description`: 具体的な改善案（判定条件の変更方針。実装そのものはこのチケットのスコープ外）
- `notes` に必ず含める:
  - 元セッションの `sessionId`
  - 該当ルール id（例: `subagent-delegation`）
  - 観察した挙動（何が起きていて、なぜ見逃し/誤検知と判断したか）
- `status`: `backlog`、`priority`: 頻度・影響度から判断（多くは `low`〜`medium`）
- 採点ロジック・閾値・ルール判定自体の変更は、起票のみで実装しない（別チケットで CEO 承認を経て実施する）。

## 4. 四半期棚卸し

- **頻度**: 四半期ごと。
- **対象**: 直近四半期に本運用（2〜3節）から起票された `cinch-NNN` タスク一覧
  （`product-backlog.json` の `notes` に `sessionId` を含むエントリ、および対応する
  `~/.ryoko/knowledge/cinch-engineering-board-archive.md` 側の完了エントリ）。
- **集計する内容**:
  - ルール別の指摘件数（見逃し／誤検知の内訳）
  - 対応済み（done）／未対応（backlog）の件数
  - 傾向（特定カテゴリ・特定ルールに偏っていないか）
- **記録先**: `~/.ryoko/knowledge/cinch-dogfooding-quarterly-review.md` に四半期ごと追記する
  （ファイルが無ければ新規作成。見出しは `## YYYY-QN` 形式）。

## 5. `docs/dogfooding-log.md` との関係

このファイルは手順書。実際の週次記録は `docs/dogfooding-log.md` に追記していく。
