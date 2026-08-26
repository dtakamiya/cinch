# cinch 採点結果画面 — 情報設計レビュー

対象: 一覧（`SessionList.tsx`）/ フィルタバー / 詳細（`SessionDetail.tsx`）/ スコア推移（`ScoreTrend.tsx`・`trend.ts`）/ 共通の `ScoreRing.tsx`・`format.ts`・`styles.css`

前提: React + Vite + TS。**依存追加なし**（CSS / SVG のみ）。実装は engineering に委ねる。commit/push はしない。

---

## サマリ — CEO の導線はどこで詰まるか

CEO が知りたいのは 3 つ、順番も決まっている:

1. **今どれくらいのスコアか**（現在地）
2. **良くなっているのか／悪くなっているのか**（傾向）
3. **次に何を直せばスコアが伸びるか**（アクション）

現状、1 は取れている。2 は「プロジェクトを選ばないと推移が出ない」時点で 1 クリック遠い。3 は**一覧では「主な減点ルール名」しか出ず、詳細に入って各カテゴリカードを目視スキャンして初めて分かる**。つまり「次アクション」への導線が一番弱い。

優先度の高い順に:

| # | 問題 | 変更案 | 期待効果 | 優先度 |
|---|------|--------|----------|--------|
| 1 | 「主な減点」がルール名だけで、失点の重み・改善策が一覧で分からない | 失点ポイント（`lost`）をタグに併記＋詳細で最上位減点を "次の一手" として最上部に昇格 | スクロールせずに「どこを直せば何点戻るか」が分かる | **高** |
| 2 | 推移ビューがプロジェクト選択時のみ。全体傾向が初手で見えない | フィルタ未選択時も「全プロジェクト平均の推移」を出す or 空状態に誘導文 | 着地して 2 秒で傾向が分かる | 高 |
| 3 | 推移 SVG の可読性: 軸ラベルが線に被る／最新点が強調されない／delta の基準が不明 | Y 軸ラベルを左マージンへ、最新点を大きく＋数値注記、head に「初回 X → 最新 Y」を明示 | 「5 件で +8 点」が読み取れる | 高 |
| 4 | 詳細のカテゴリカードが均等 3 枚。悪いカテゴリが視覚的に埋もれる | カテゴリを達成率順に並べ、60%未満のカードに枠色（`--bad`）を付ける | 弱点カテゴリに視線が最初に行く | 中 |
| 5 | 色の意味づけが実質「良し悪し 3 段階」だけ。accent（紫）と good（緑）が推移で共存し混乱 | 推移の主役線を「値によって色替え」せず中立の accent に統一する現状は妥当。ただし凡例に「線＝移動平均、点＝スコア帯」を明記し、点の色 = リングの色であることを言語化 | 色の対応が学習不要になる | 中 |
| 6 | `trend__svg` に `aria-hidden="true"`＋`preserveAspectRatio="none"` | `role="img"` と `<title>`/`<desc>` を付与、テキストは非スケール化 or `<foreignObject>` 回避で別レイヤ | スクリーンリーダーで傾向が読める／文字が歪まない | 中 |
| 7 | フォーカス可視化が `.session-card` のみ。`select` は `outline:none` で潰されている | filter-pill の select にフォーカスリングを戻す | キーボード操作でどこにいるか分かる | 中 |
| 8 | 一覧カードの情報密度: メタ 3 項目（時刻・所要・ターン）が減点より目立つ | メタを 1 段弱め、右カラムの「主な減点」を主役化 | 視線が「スコア→減点」に流れる | 低 |
| 9 | `formatDuration` の "24時間+" 等、推移の日付レンジ表記がスケール感に欠ける | head の期間表記を「相対（過去 N 日）」に | レンジの長さが直感的 | 低 |

---

## 1. 「スコア → 傾向 → アクション」導線

### 現状

- **一覧**: `stat-row`（平均・採点済件数）→ `filter-bar` → （プロジェクト選択時のみ）`ScoreTrend` → カード列。
- カード右カラムは `session-card__right-label`「主な減点」＋ `deduction-tag`（色ドット＋ルール名のみ）。**失点量が出ていない。** `topDeduction` は `{ id, lost }` を返しているのに `lost` を捨てている（`SessionList.tsx:231`）。
- **詳細**: `detail-hero`（リング＋メタチップ）→ カテゴリ 3 枚。各カード内で `score.rules` は失点降順に並ぶが、**カテゴリをまたいだ "最も痛い 1 個" が最上部に来ない**。CEO はカードを 3 枚スキャンしないと「次の一手」に辿り着けない。

### 問題点

1. 一覧の「主な減点」= ラベルのみ。「`tool-error-rate` で 10 点失っている」のか「1 点」なのかが分からず、優先順位が付けられない。
2. 詳細に「まずこれを直せ」の単一フォーカスがない。`rule-advice`（`→ …`）は各行の末尾に小さく散在。
3. 推移が初期状態で見えない（→ セクション 2）。

### 変更案

**1-a. 一覧「主な減点」に失点を併記**（`SessionList.tsx:223-233`）

```tsx
<span className="deduction-tag">
  <span className="deduction-tag__dot" style={{ background: scoreColor(s.total) }} />
  {RULE_LABELS[s.topDeduction.id] ?? s.topDeduction.id}
  <span className="deduction-tag__lost num">−{formatScore(s.topDeduction.lost)}</span>
</span>
```

CSS:
```css
.deduction-tag__lost {
  color: var(--bad);
  font-weight: 600;
  margin-left: 2px;
}
```

**1-b. 詳細に「次の一手」ブロックを追加**（`SessionDetail.tsx`、`detail-hero` の直後 / カテゴリグリッドの前）

`score.rules[0]`（既に失点降順）を使い、advice があればそれを主文にする。

```tsx
{score.gradable && score.rules[0] && score.rules[0].earned < score.rules[0].max && (
  <section className="next-action">
    <span className="next-action__kicker">次に効く改善</span>
    <p className="next-action__title">
      {RULE_LABELS[score.rules[0].id] ?? score.rules[0].id}
      <span className="num">
        （−{formatScore(score.rules[0].max - score.rules[0].earned)} 点）
      </span>
    </p>
    <p className="next-action__body">
      {score.rules[0].advice ?? score.rules[0].evidence}
    </p>
  </section>
)}
```

```css
.next-action {
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  border-radius: var(--radius);
  padding: 16px 18px;
  margin: 16px 0 8px;
}
.next-action__kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent);
  font-weight: 600;
}
.next-action__title {
  margin: 4px 0 6px;
  font-size: 15px;
  font-weight: 600;
}
.next-action__title .num { color: var(--bad); font-weight: 700; margin-left: 4px; }
.next-action__body {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.55;
}
```

**期待効果**: 一覧で「どのセッションのどこが痛いか」を件数分スキャンできる。詳細を開けば最初の画面で「次に何をすればいいか」が 1 文で読める。カテゴリカードは "詳細な内訳" に降格でき、役割が明確になる。

---

## 2. 推移ビューの露出

### 現状

`SessionList.tsx:191` — `filters.project !== ""` のときだけ `ScoreTrend` を描画。`trendSessions` は「そのプロジェクトの全セッション」（期間フィルタは意図的に無視、コメントあり）。`points.length < 2` で `null`。

### 問題点

- 着地直後（プロジェクト未選択）は `stat-row` の平均値 1 個しか傾向情報がない。「先週より良い／悪い」が分からない。
- プロジェクトを選んでも 2 件未満なら何も出ず、無言で消える（プレースホルダなし）。

### 変更案

**2-a. 全体推移をデフォルト表示**
`filters.project === ""` のとき、`data.sessions`（gradable のみ）を日付順に並べ、**同日 or セッション単位の平均スコア推移**を出す。`buildTrend` はそのまま流用可能（`sessions` を全件渡す）。head のタイトルを「全プロジェクトのスコア推移」に切り替え。

**2-b. データ不足時のプレースホルダ**
`points.length < 2` のとき `null` を返す代わりに、`trend` コンテナだけ出して「推移を表示するには採点済みセッションが 2 件以上必要です」を表示。無言で消えるより状態が分かる。

**期待効果**: 画面を開いた瞬間に "組織全体として上向きか下向きか" が分かる。プロジェクト選択は「ドリルダウン」の位置づけになり、導線が階層化される。

---

## 3. スコア推移 SVG の可読性

### 現状（`ScoreTrend.tsx`）

- viewBox `640×180`、`preserveAspectRatio="none"` で横に引き伸ばし。
- グリッド線 0/50/100、ラベルは**線のすぐ上・左端**（`x={padX} y={y(v)-3}`）→ 折れ線と重なる。
- 生スコア線 `--border`（1.5px）、移動平均線 `--accent`（2.5px）、各点は `scoreColor()` で 3 色。
- head に「N セッション・M/D HH:MM 〜 M/D HH:MM」、右に delta バッジ。
- 凡例: 「移動平均（直近 5 件）」「セッション別スコア」。

### 問題点

1. **`preserveAspectRatio="none"`**: 横長画面でグラフが潰れ、`<text>`（軸ラベル・目盛り）も一緒に伸縮して字が歪む。ドットも楕円になる。
2. **軸ラベルが線と被る**: 0/50/100 が折れ線・平均線と重なって読みにくい。左に軸用マージンがない（`padX=16` のみ）。
3. **最新点が強調されない**: 全点 `r=3` 均一。CEO が一番見たい "今" が埋もれる。
4. **delta の基準が曖昧**: 「+8 点」だけ。「何から何へ」（初回スコア→最新スコア）が head に出ていない。`first.total`/`last.total` は計算済みなのに未表示。
5. **移動平均と生スコアの区別が色頼み**: `--border`（グレー）の生線は暗所だと見えにくい。凡例の意味（なぜ 2 本あるか＝ブレを均すため）が書かれていない。
6. **X 軸に日付目盛りがない**: 点の間隔が等間隔（インデックス配置）なので、時間的な粗密が分からない。head のレンジ表記だけが頼り。
7. **`num` クラスが `trend__legend` に付いているが凡例に数値はない**（軽微）。

### 変更案

**3-a. アスペクト比を保つ or レイヤ分離**
最小変更: `preserveAspectRatio="xMidYMid meet"` にし、コンテナ高さ固定（`height:180px`）＋ `width:100%`。横長でも中央寄せで潰れない。
より良い案: SVG は線・点だけ描き、**軸ラベル／目盛り数値は HTML オーバーレイ**（`position:absolute` の div）にして歪みゼロ・フォント制御可。CSS/SVG のみで実現可。

**3-b. 軸レイアウト**
左に `padLeft=28` を確保し、目盛り数値（0/50/100）をプロット領域の外・左に右寄せ配置。グリッド線は `--border-soft` のまま薄く。

```
 100 ┤   ╭──●
     │ ╭─╯
  50 ┤─╯        ← 平均線（accent, 2.5px）
     │·····•     ← 生線（点線 or 半透明 accent）
   0 ┤
     └─────────────
     8/1        8/27
```

**3-c. 最新点の強調**
```tsx
{points.map((p, i) => {
  const isLast = i === points.length - 1;
  return (
    <circle key={p.sessionId} cx={x(i)} cy={y(p.total)}
      r={isLast ? 5 : 3}
      fill={scoreColor(p.total)}
      stroke={isLast ? "var(--panel)" : "none"} strokeWidth={isLast ? 2 : 0} />
  );
})}
{/* 最新スコアの数値ラベル */}
<text x={x(n-1)} y={y(last.total) - 10} fontSize={11} fill="var(--fg)"
  textAnchor="end" fontWeight={600}>{formatScore(last.total)}</text>
```
（`preserveAspectRatio="none"` を残すなら数値ラベルは HTML 側に。3-a で meet に変えるのが前提）

**3-d. head に基準を明示**（`ScoreTrend.tsx:56-67`）
```tsx
<span className="trend__sub num">
  {n} セッション ・ 初回 {formatScore(first.total)} → 最新 {formatScore(last.total)}
</span>
...
<span className={`trend__delta trend__delta--${deltaClass} num`}>
  {deltaLabel} 点
</span>
```
delta バッジに矢印アイコン（▲▼、SVG or 既存 `IconArrowRight` の回転）を添えると色覚に依存しない。

**3-e. 生スコア線を「点線」に**
色だけでなく線種で移動平均と差別化:
```tsx
<path d={rawPath} fill="none" stroke="var(--faint)" strokeWidth={1.5}
  strokeDasharray="2 3" />
```
凡例も「セッション別スコア（点線）」「移動平均・直近5件（実線）」と線種を明記。

**3-f. 凡例に "なぜ 2 本か" を一言**
`trend__legend` の下に `trend__note`（`font-size:11px; color:var(--faint)`）で「移動平均はセッションごとのブレを均した傾向線です」。

**期待効果**: 「5 セッションで 72 → 80、+8 点、上向き」が凡例を読まずに 1 枚で把握できる。横長ディスプレイでも字が歪まない。

---

## 4. 減点項目の見せ方（詳細カテゴリカード）

### 現状（`SessionDetail.tsx:79-137`）

- `category-grid` に 3 カード（コスト効率／生産性／ベストプラクティス）を `auto-fit minmax(320px,1fr)` で均等配置。
- カード: 見出し＋`bucket.earned / max`、`category-bar`（達成率、80/60 で 3 色）、ルール行（✓/✗ マーク・ラベル・`earned/max`・evidence・advice）。
- ルールは `score.rules` の失点降順を `filter` で維持。

### 問題点

1. **3 枚が等価に並ぶ**ので、40% のカテゴリと 95% のカテゴリが同じ視覚的重み。弱点が埋もれる。
2. **カード内で満点ルールと失点ルールが同列**。✓ 行（満点）は情報量が低いのに evidence まで表示され、✗ 行を探すのに読み飛ばしが要る。
3. `category-bar__fill` の色分岐（`SessionDetail.tsx:106-112`）が inline style のロジックで、`scoreColor` と閾値（80/60 vs pct 0.8/0.6）が別実装。一貫性リスク。
4. `rule-evidence` / `rule-advice` の左インデント `25px` はマジックナンバー（マーク幅＋gap）。マークサイズ変更で崩れる。

### 変更案

**4-a. カテゴリを達成率昇順（悪い順）に並べ、弱点カードを強調**
```tsx
const orderedCategories = [...CATEGORIES].sort((a, b) => {
  const pa = data.score.categories[a].max === 0 ? 1
    : data.score.categories[a].earned / data.score.categories[a].max;
  const pb = data.score.categories[b].max === 0 ? 1
    : data.score.categories[b].earned / data.score.categories[b].max;
  return pa - pb;
});
```
```css
.category-card[data-weak="true"] {
  border-color: var(--bad);
}
```
`pct < 0.6` のカードに `data-weak="true"`。

**4-b. 満点ルールを折りたたむ**
デフォルトで `earned >= max` の行は「✓ 達成 N 項目」の 1 行サマリに畳み、`<details>` で展開可（JS 不要、ネイティブ `<details>`）。失点行だけが最初から見える。

```tsx
const failing = rules.filter((r) => r.earned < r.max);
const passing = rules.filter((r) => r.earned >= r.max);
// failing を先に描画、passing は <details><summary>✓ 達成 {passing.length} 項目</summary>...
```

**4-c. 達成率の色を `scoreColor` 系に寄せる**
`category-bar__fill` の色を `pct*100` に対して `scoreColor()` を流用（閾値 80/60 に統一）。inline のロジック重複を消す。※採点基準の閾値そのものには触れない、表示側の一貫化のみ。

**4-d. インデントをトークン化**
```css
:root { --rule-indent: 25px; }  /* マーク16 + gap9 */
.rule-evidence, .rule-advice { margin-left: var(--rule-indent); }
```

**期待効果**: 詳細を開くと弱点カテゴリが赤枠で最初に目に入り、その中の失点ルールだけが展開状態。満点項目のノイズが減る。

---

## 5. カラー・タイポgrafi・余白・コントラスト・フォーカス

### 良い点（現状維持）

- OKLCH トークンでライト/ダーク両対応、`--good/--warn/--bad` の意味づけが一貫。
- `scoreColor()` の閾値（80/60）がリング・バー・推移の点で共通。
- `font-variant-numeric: tabular-nums`（`.num`）で数値の桁揃え。
- `.session-card:focus-visible` にリングあり。`content-visibility` で長い一覧を軽量化。

### 問題点

1. **`filter-pill select { outline: none }`**（`styles.css:219`）— セレクトのフォーカスが完全に消える。キーボードユーザーが現在位置を見失う。`.app-header__toggle` の checkbox、`filter-pill` の checkbox にも `:focus-visible` スタイルなし。
2. **推移の点の色（`scoreColor`）とコントラスト**: `--bad`（ダーク: `oklch(0.68 0.15 25)`）が `--panel`（`0.194`）上で `r=3` の小円。細い要素は WCAG 的に 3:1 が要るが赤系小円は判別が苦しい。→ 3-c の "最新点に panel 色の縁取り" で改善。他の点も `r` を 3→3.5、または縁取り。
3. **`trend` グリッド線 `--border-soft`** はダークで `oklch(0.26)`、`--panel`（0.194）との差 ≈ 0.07。ほぼ見えない。意図的に控えめなら OK だが、0/50/100 の基準線としては薄すぎ。`--border`（0.30）に上げる余地。
4. **`rule-advice` の色 `--accent`（紫）**: リンクの `--accent` と同じ。アドバイスはリンクではないので、`--fg` ＋左ボーダー `--accent-line` の "引用" スタイルの方が誤クリック誘発しない。
5. **タイポ**: 詳細 `h2` 26px / カード `h3` 14px と飛びが大きい。中間の `next-action__title`（案 1-b, 15px）が入ると階層が締まる。一覧 `session-card__title` 15px と詳細カード見出し 14px が逆転気味（一覧の子要素の方が大きい）。
6. **余白の一貫性**: `trend` `padding:16px 18px`、`stat-card` `12px 20px`、`category-card` `20px`、`filter-pill` `7px 12px`。カード系が 16/18/20 でバラつく。`--pad-card: 18px` 等でトークン化推奨。
7. **`meta-chips`（詳細）と `session-meta`（一覧）** が似た情報を別レイアウト（チップ vs アイコン付きインライン）。詳細のチップ 8 個は視覚的に重い。主要 3 つ（開始・所要・ターン）を大きく、残りを `<details>` か 2 段目に。
8. **`aria-label` はあるが `aria-hidden` の SVG**: `ScoreTrend` の `<section aria-label>` は良いが中身が `aria-hidden="true"`。数値サマリ（head の delta と "初回→最新"）がテキストであるのが救い。`ScoreRing` も `aria-hidden` でリング内の数値は `<span>` テキスト → スコア自体は読める。詳細 hero のリングに `aria-label="スコア {total} 点"` を付けると明快。

### 変更案（まとめ）

```css
/* フォーカス可視化を復活 */
.filter-pill select:focus-visible,
.filter-pill input:focus-visible,
.app-header__toggle input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

/* グリッド線を視認できる濃さへ */
.trend__svg line { stroke: var(--border); }  /* または JSX の stroke を差し替え */

/* advice を引用スタイルへ（リンク色をやめる） */
.rule-advice {
  color: var(--fg);
  border-left: 2px solid var(--accent-line);
  padding-left: 8px;
  margin-left: calc(var(--rule-indent) - 10px);
}

/* カードパディングのトークン化 */
:root { --pad-card: 18px; }
.trend, .category-card, .stat-card { padding: var(--pad-card); }
```

**期待効果**: キーボード操作でフィルタを触れる。推移の基準線が見える。アドバイスがリンクと誤認されない。カード余白が揃う。

---

## 6. 範囲外だが気づいた点（指摘のみ）

- **採点基準そのものは対象外**。ただし表示に影響する点として:
  - `topDeduction` は `max - earned` の絶対値で最大を取る（`score.ts:75`）。カテゴリの重み（`max`）が大きいルールが常に "主な減点" に出やすい。CEO に見せる "次の一手" としては「失点額」で正しいが、「伸びしろ（改善で戻せる点）」とは限らない（既に部分点があるルールは満点まで詰めても差分が小さい）。表示ラベルを「最大の失点」と正確に書くのが無難。
  - `buildTrend` の X 軸はインデックス等間隔。時間軸ではないので「1 日で 10 セッション」と「1 ヶ月で 10 セッション」が同じ見た目。時間スケール対応は別チケット候補。
- `formatDuration` の "24時間+" クランプは推移 head のレンジ表記には使われていない（`formatDateTime` のみ）。問題なし、確認まで。
- `ScoreTrend.test.tsx` / `trend.test.ts` は純粋関数中心。上記 UI 変更（軸レイアウト・最新点強調・プレースホルダ）に合わせてレンダリングテストの追加が必要。

---

## 実装順の提案（engineering 向け）

1. **P0 / 低リスク・高効果**: 案 1-a（失点併記）、1-b（次の一手ブロック）、3-d（head に初回→最新）、5 のフォーカス可視化。CSS/JSX の局所変更、既存テスト影響小。
2. **P1**: 案 2（推移のデフォルト表示＋プレースホルダ）、案 4-a/4-b（カテゴリ並べ替え・満点折りたたみ）。ロジック追加あり、テスト追加要。
3. **P2**: 案 3-a/3-b/3-c/3-e（SVG 軸レイアウトの作り直し）。見た目の変更が大きくスナップショット/目視確認が必要。
4. **P3**: 案 5 の余白トークン化・タイポ階層・`meta-chips` 整理。リグレッション確認しつつ段階的に。
