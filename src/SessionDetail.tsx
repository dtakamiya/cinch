import { CATEGORIES, type Category, type SessionDetailResponse } from "../shared/types.js";
import {
  CATEGORY_LABELS,
  RULE_LABELS,
  formatDateTime,
  formatDuration,
  formatScore,
} from "./format.js";

export function SessionDetail({
  data,
  onBack,
}: {
  data: SessionDetailResponse;
  onBack: () => void;
}) {
  const { metrics, score } = data;
  const models = Object.entries(metrics.models)
    .sort((a, b) => b[1] - a[1])
    .map(([name, turns]) => `${name}（${turns}）`)
    .join(" / ");

  return (
    <div className="detail">
      <button type="button" className="link" onClick={onBack}>
        ← 一覧に戻る
      </button>

      <h2>
        {metrics.projectName}{" "}
        {score.gradable ? (
          <span className="score">{formatScore(score.total)}</span>
        ) : (
          <span className="ungraded">採点対象外</span>
        )}
      </h2>

      <div className="meta-grid">
        <span>開始 {formatDateTime(metrics.startedAt)}</span>
        <span>所要 {formatDuration(metrics.durationMs)}</span>
        <span>assistant ターン {metrics.assistantTurns}</span>
        <span>ツール呼び出し {metrics.toolCalls}（失敗 {metrics.toolErrors}）</span>
        <span>モデル {models === "" ? "—" : models}</span>
        <span>バージョン {metrics.version === "" ? "—" : metrics.version}</span>
        <span>ブランチ {metrics.gitBranch ?? "—"}</span>
        <span>出力 {metrics.totals.output.toLocaleString()} トークン</span>
      </div>

      {metrics.parseErrors > 0 && (
        <p className="notice">
          読み取れなかったログが {metrics.parseErrors} 行あります。読めた分のみで採点しています。
        </p>
      )}

      {!score.gradable ? (
        <p className="notice">
          assistant ターンが 3 回未満のため採点対象外です。短いセッションでは
          キャッシュ効率などの指標が意味を持たないため、スコアを付けていません。
        </p>
      ) : (
        CATEGORIES.map((category) => (
          <CategoryBlock key={category} category={category} data={data} />
        ))
      )}
    </div>
  );
}

function CategoryBlock({
  category,
  data,
}: {
  category: Category;
  data: SessionDetailResponse;
}) {
  const bucket = data.score.categories[category];
  // score.rules は既に減点の大きい順に並んでいるので、絞り込むだけで順序が保たれる
  const rules = data.score.rules.filter((r) => r.category === category);
  if (rules.length === 0) return null;

  return (
    <section className="category-block">
      <h3>
        {CATEGORY_LABELS[category]}{" "}
        <span className="rule-points">
          {formatScore(bucket.earned)} / {bucket.max}
        </span>
      </h3>
      {rules.map((rule) => {
        const full = rule.earned >= rule.max;
        return (
          <div className="rule-row" key={rule.id}>
            <div className="rule-head">
              <span className={`rule-mark ${full ? "ok" : "ng"}`}>
                {full ? "✓" : "✗"}
              </span>
              <span data-testid="rule-label">{RULE_LABELS[rule.id] ?? rule.id}</span>
              <span className="rule-points">
                {formatScore(rule.earned)} / {rule.max}
              </span>
            </div>
            <p className="rule-evidence">{rule.evidence}</p>
            {rule.advice !== null && <p className="rule-advice">→ {rule.advice}</p>}
          </div>
        );
      })}
    </section>
  );
}
