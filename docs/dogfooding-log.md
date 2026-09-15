# ドッグフーディング週次ログ

手順は `docs/dogfooding.md` 参照。1週次1エントリを追記する（新しい記録を上に追加）。

## 2026-09-15

- 対象セッション数: 1（gradable: 1）— cinch-010 自体の作業セッション（sessionId: `4ff1f33f-c3ba-4b7f-b0a6-fb4b990fdff1`）を対象に、本運用の初回実証として採点
- 総合スコアレンジ: 94.6〜94.6（median: 94.6）
- 主要減点トップ3:
  1. `task-planning` — 失点 4.0点 / ツール呼び出し22回・45ターンの複数ファイル作業で TodoWrite 未使用
  2. `bash-over-native-tools` — 失点 0.9点 / ツール呼び出し22回中3回（ls 2回・find 1回）が Bash 使用。Glob で代替可能だった
  3. `cache-ttl-waste` — 失点 0.4点 / 1h キャッシュ作成45回中1回が再利用されず失効
- 仕分け結果:
  - (a) 実際に非効率: `task-planning`（ブランチ作成→ドキュメント2ファイル作成→CLAUDE.md編集→typecheck/test/build という複数ステップ作業だったが着手前にTodoWriteでタスク分解していなかった。指摘は妥当、次回から着手前にTodoWrite化する）、`bash-over-native-tools`（ディレクトリ確認・ファイル検索にBashの`ls`/`find`を使った箇所があり、Glob で代替すべきだった）
  - (b) 見逃し/誤検知 → 起票: なし（今回のセッションでは該当事例が見つからなかった）
- メモ: 初回実証のため対象は1セッションのみ。次回以降は複数セッションをまとめて確認する。

## テンプレート

```
## YYYY-MM-DD

- 対象セッション数: N（gradable: N）
- 総合スコアレンジ: min〜max（median: N）
- 主要減点トップ3:
  1. <ruleId> — 平均失点 N点 / <補足>
  2. <ruleId> — 平均失点 N点 / <補足>
  3. <ruleId> — 平均失点 N点 / <補足>
- 仕分け結果:
  - (a) 実際に非効率: <件数・概要>
  - (b) 見逃し/誤検知 → 起票: cinch-NNN, cinch-NNN
- メモ:
```
