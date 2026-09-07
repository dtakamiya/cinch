import { expect, test } from "@playwright/test";
import { assertNoConsoleErrors, collectConsoleErrors } from "./helpers.js";
import { DETAIL_SESSION_ID } from "./fixtures/seed.js";

/**
 * 主要 3 画面のブラウザ smoke ＋ ルーティング遷移 1 本。
 *
 * jsdom のユニットテストは実描画しないため、cinch-020（CSS ブロックの丸ごと
 * 欠落）のように typecheck / test / build を素通りする回帰がある。実ブラウザで
 * マウント・可視性・computed style・SVG 属性・コンソール error 0 件を確認する。
 *
 * ビジュアル（toHaveScreenshot）は入れない。ベースライン画像が OS 依存
 * （-chromium-darwin / -chromium-linux）で、レイアウト変更のたびに macOS と
 * Linux 双方を撮り直す運用コストに、崩れ検知の実利が見合わない。cinch-020 型の
 * 「CSS ルールが丸ごと死ぬ」事故は下の computed style アサーションで確実に
 * 捕まる（回帰性は実証済み）。粗いビジュアル比較が必要になったら別タスクで
 * OS 別ベースラインの CI 生成込みで設計する。
 *
 * ネットワーク待ち: 一覧・ベンチマークは GET /api/sessions を、詳細は
 * GET /api/sessions/:id を待ってから描画する。goto に networkidle を付け、
 * さらに最初の可視性チェックに余裕のある timeout を明示してフレークを抑える。
 */
const FIRST_PAINT_TIMEOUT = 10_000;

test.describe("一覧 (#/)", () => {
  test("ヘッダーとセッション一覧がマウント・表示される", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/#/", { waitUntil: "networkidle" });

    const header = page.locator(".app-header");
    await expect(header).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    await expect(header.locator("h1")).toHaveText("cinch");

    const list = page.locator(".session-list");
    await expect(list).toBeVisible();
    // fixture の採点済みセッション: proj-a / b / c（各 1）＋ trend-proj（4）＝ 7 枚。
    // 既定フィルタは「採点対象外を表示」オフなので採点済みだけが並ぶ。
    await expect(page.locator(".session-card")).toHaveCount(7);

    assertNoConsoleErrors(errors);
  });
});

test.describe("詳細 (#/session/<id>)", () => {
  test("ヒーローとカテゴリグリッドと ScoreRing SVG が表示される", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto(`/#/session/${DETAIL_SESSION_ID}`, { waitUntil: "networkidle" });

    await expect(page.locator(".detail-hero")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    await expect(page.locator(".category-grid")).toBeVisible();
    // カテゴリは cost / productivity / practice の 3 枚
    await expect(page.locator(".category-grid .category-card")).toHaveCount(3);

    // ヒーローのスコアリングは SVG。CSS ではなく SVG 属性の欠落でも壊れるため、
    // 要素の存在と viewBox 属性を直接見る（ScoreRing.tsx が viewBox を出す契約）。
    const ring = page.locator(".detail-hero__ring svg");
    await expect(ring).toBeVisible();
    await expect(ring).toHaveAttribute("viewBox", /.+/);

    assertNoConsoleErrors(errors);
  });
});

test.describe("ベンチマーク (#/benchmark)", () => {
  test("テーブルが表示され、当該 CSS ブロックが効いている", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/#/benchmark", { waitUntil: "networkidle" });

    const table = page.locator(".benchmark__table");
    await expect(table).toBeVisible({ timeout: FIRST_PAINT_TIMEOUT });
    // fixture のプロジェクト行: proj-a / b / c ＋ trend-proj ＝ 4 行
    // （採点済み 1 件以上のプロジェクトが 1 行ずつ）。
    await expect(page.locator(".benchmark__row")).toHaveCount(4);

    // --- cinch-020 の直接的な回帰検知 ---
    // styles.css の .cat-spark__foot-sub ブロックが壊れると、CSS パーサーが
    // それ以降のルール（.benchmark__* を丸ごと）を不正な入れ子として捨てる。
    // 「1 プロパティだけ」だと将来そのプロパティが消えたときに検知力が落ちるので、
    // 同ブロック内の複数プロパティ（table 本体・td・thead th・外枠）を検証点にする。
    // ※ 値は styles.css の現在値と一致させること。styles.css 側を変えたらここも追従。

    // .benchmark__table { border-collapse: collapse }  (src/styles.css)
    const borderCollapse = await table.evaluate(
      (el) => getComputedStyle(el).borderCollapse,
    );
    expect(
      borderCollapse,
      "styles.css の .benchmark__table ルールが効いていない（cinch-020 の CSS ブロック欠落の疑い）",
    ).toBe("collapse");

    // .benchmark__table th, td { padding: 10px 12px }  → paddingTop は厳密に 10px
    const cellPaddingTop = await table
      .locator("tbody td")
      .first()
      .evaluate((el) => getComputedStyle(el).paddingTop);
    expect(
      cellPaddingTop,
      "styles.css の `.benchmark__table th, td { padding: 10px 12px }` が効いていない（値を変えたらこのアサーションも更新すること）",
    ).toBe("10px");

    // .benchmark__table thead th { text-transform: uppercase }
    const theadTransform = await page
      .locator(".benchmark__table thead th")
      .first()
      .evaluate((el) => getComputedStyle(el).textTransform);
    expect(
      theadTransform,
      "styles.css の .benchmark__table thead th ルールが効いていない",
    ).toBe("uppercase");

    // .benchmark__scroll { border: 1px solid var(--border-soft); border-radius: var(--radius) }
    // 視覚的に最も目立つ外枠。border-radius は --radius = 12px。初期値 0px でないこと。
    const scroll = page.locator(".benchmark__scroll");
    const scrollStyle = await scroll.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderTopLeftRadius, width: cs.borderTopWidth };
    });
    expect(
      scrollStyle.radius,
      "styles.css の .benchmark__scroll の border-radius（--radius: 12px）が効いていない",
    ).toBe("12px");
    expect(
      scrollStyle.width,
      "styles.css の .benchmark__scroll の border（1px）が効いていない",
    ).toBe("1px");

    assertNoConsoleErrors(errors);
  });
});

test.describe("ルーティング遷移", () => {
  test("一覧 → 詳細 → 戻る で state が破綻しない", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/#/", { waitUntil: "networkidle" });
    await expect(page.locator(".session-list")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    // 採点済みカードは <a> でヒーローへ遷移する。1 枚目をクリック。
    await page.locator(".session-card").first().click();
    await expect(page.locator(".detail-hero")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });

    // ブラウザ戻る（hashchange）。App.tsx は詳細 route を離れるとき
    // loading / error（404 バナー・中断された in-flight）を片付ける契約。
    await page.goBack();
    await expect(page.locator(".session-list")).toBeVisible({
      timeout: FIRST_PAINT_TIMEOUT,
    });
    // 詳細の残骸（エラーバナー・読み込み中）が一覧に持ち越されていないこと。
    await expect(page.locator(".error")).toHaveCount(0);
    await expect(page.locator(".notice")).toHaveCount(0);

    assertNoConsoleErrors(errors);
  });
});
