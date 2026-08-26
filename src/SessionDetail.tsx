import { CATEGORIES, type Category, type SessionDetailResponse } from "../shared/types.js";
import { ScoreRing } from "./ScoreRing.js";
import { IconCheck, IconChevronLeft, IconX } from "./icons.js";
import {
  CATEGORY_LABELS,
  RULE_LABELS,
  formatDateTime,
  formatDuration,
  formatScore,
  scoreColor,
} from "./format.js";

export function SessionDetail({ data }: { data: SessionDetailResponse }) {
  const { metrics, score } = data;
  const models = Object.entries(metrics.models)
    .sort((a, b) => b[1] - a[1])
    .map(([name, turns]) => `${name}（${turns}）`)
    .join(" / ");

  return (
    <div className="detail">
      <a className="link" href="#/">
        <IconChevronLeft />
        一覧に戻る
      </a>

      <div className="detail-hero">
        {score.gradable ? (
          <div className="detail-hero__ring">
            <ScoreRing total={score.total} size={108} />
          </div>
        ) : null}
        <div>
          <h2>
            {metrics.projectName}{" "}
            {score.gradable ? null : <span className="ungraded">採点対象外</span>}
          </h2>
          <div className="meta-chips">
            <span className="meta-chip">開始 {formatDateTime(metrics.startedAt)}</span>
            <span className="meta-chip">所要 {formatDuration(metrics.durationMs)}</span>
            <span className="meta-chip">assistant {metrics.assistantTurns} ターン</span>
            <span className="meta-chip">
              ツール {metrics.toolCalls}（失敗 {metrics.toolErrors}）
            </span>
            <span className="meta-chip">モデル {models === "" ? "—" : models}</span>
            <span className="meta-chip">
              バージョン {metrics.version === "" ? "—" : metrics.version}
            </span>
            <span className="meta-chip">ブランチ {metrics.gitBranch ?? "—"}</span>
            <span className="meta-chip">
              出力 {metrics.totals.output.toLocaleString()} トークン
            </span>
          </div>
        </div>
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
        <div className="category-grid">
          {CATEGORIES.map((category) => (
            <CategoryBlock key={category} category={category} data={data} />
          ))}
        </div>
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

  const pct = bucket.max === 0 ? 0 : bucket.earned / bucket.max;

  return (
    <section className="category-card">
      <div className="category-card__head">
        <h3>{CATEGORY_LABELS[category]}</h3>
        <span className="rule-points">
          {formatScore(bucket.earned)} / {bucket.max}
        </span>
      </div>
      <div className="category-bar">
        <div
          className="category-bar__fill"
          style={{
            width: `${Math.round(pct * 100)}%`,
            background:
              pct >= 0.8
                ? "var(--good)"
                : pct >= 0.6
                  ? "var(--warn)"
                  : "var(--bad)",
          }}
        />
      </div>
      {rules.map((rule) => {
        const full = rule.earned >= rule.max;
        return (
          <div className="rule-row" key={rule.id}>
            <div className="rule-head">
              <span className="rule-mark" data-testid="rule-mark" data-ok={full}>
                {full ? <IconCheck size={16} /> : <IconX size={16} />}
              </span>
              <span className="rule-head__label" data-testid="rule-label">
                {RULE_LABELS[rule.id] ?? rule.id}
              </span>
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
