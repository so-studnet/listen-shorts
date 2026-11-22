import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const shots = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test("マニフェスト・アイコン・Service Worker がそろっている", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({
    name: "ListenShorts",
    display: "standalone",
    start_url: "/",
    lang: "ja",
  });
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);

  // iPhone 向け：ホーム画面のアイコンとアプリとして開く設定
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(appleIcon!)).status()).toBe(200);
  await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");

  // Service Worker：登録され、毎回取り直す設定
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-store");
});

test("ホーム画面への追加の案内：iPhone の Safari では手順、アプリとして開いていれば ✅", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/settings");
  const guide = page.getByTestId("install-guide");
  await expect(guide).toContainText("「ホーム画面に追加」を押す");
  await guide.scrollIntoViewIfNeeded();
  await shot(page, "25-install-guide");
  await ctx.close();

  const ctx2 = await browser.newContext({ userAgent: IPHONE_UA });
  await ctx2.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { get: () => true });
  });
  const page2 = await ctx2.newPage();
  await page2.goto("/settings");
  await expect(page2.getByTestId("standalone")).toBeVisible();
  await ctx2.close();
});

test("書き出したファイルから読み込むと、記録が戻る（Safari → ホーム画面のアプリへの移し替え）", async ({ page }) => {
  const sample = JSON.parse(readFileSync(path.join(__dirname, "../src/data/sample-pack.json"), "utf8"));
  sample.packId = "mine";
  sample.title = "自分のパック";
  for (const c of sample.clips) for (const i of c.items) i.itemId = `mine-${i.itemId}`;
  await page.goto("/settings");
  await page.getByLabel("パックの JSON").fill(JSON.stringify(sample));
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect(page.getByTestId("data-size")).toContainText("パック 1 個");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /データを書き出す/ }).click(),
  ]);
  const backup = readFileSync(await download.path(), "utf8");

  await page.getByRole("button", { name: "すべてのデータを削除" }).click();
  await page.getByRole("button", { name: /本当にすべて削除/ }).click();
  await expect(page.getByTestId("data-size")).toContainText("パック 0 個");

  // まちがえてパックのファイルを選んだとき
  await page.getByTestId("backup-input").setInputFiles({
    name: "pack.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(sample)),
  });
  await expect(page.getByRole("alert").filter({ hasText: "書き出しファイルではありません" })).toBeVisible();

  await page.getByTestId("backup-input").setInputFiles({
    name: "listen-shorts-20261122.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  const dialog = page.getByRole("alertdialog", { name: "データの読み込みの確認" });
  await expect(dialog).toContainText("パック 1 個");
  await shot(page, "26-backup-confirm");
  await dialog.getByRole("button", { name: "置き換える" }).click();
  await expect(page.getByRole("status").filter({ hasText: "データを読み込みました" })).toBeVisible();
  await expect(page.getByTestId("data-size")).toContainText("パック 1 個");
  await expect(page.getByTestId("pack-mine")).toBeVisible();
});
