import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const shots = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
const sample = JSON.parse(
  readFileSync(path.join(__dirname, "../src/data/sample-pack.json"), "utf8"),
);
function myPack(version = 1) {
  const p = structuredClone(sample);
  p.packId = "mine";
  p.title = "自分のパック";
  p.version = version;
  p.clips = [p.clips[0], p.clips[1]];
  for (const c of p.clips) for (const i of c.items) i.itemId = `mine-${i.itemId}`;
  return p;
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("listen-shorts:v1:data") ?? "{}"));

test("ファイルから読み込める。中身の誤りは行番号つきで出て、その行へ移動できる", async ({ page }) => {
  await page.goto("/settings");
  const broken = myPack();
  broken.clips[1].items[3].answer = "They was out of";
  const text = JSON.stringify(broken, null, 2);
  await page.getByTestId("file-input").setInputFiles({
    name: "week4.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(page.getByText("ファイル：week4.json")).toBeVisible();
  const alert = page.getByRole("alert").filter({ hasText: "読み込めませんでした" });
  const line = text.split("\n").findIndex((l) => l.includes('"They was out of"')) + 1;
  await expect(alert).toContainText(`${line}行目`);
  await expect(alert).toContainText("clips[1].items[3].answer");
  await expect(alert).toContainText('文の中に"They was out of" が見つかりません');
  await alert.getByRole("button", { name: "行へ移動" }).click();
  const selected = await page
    .getByLabel("パックの JSON")
    .evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
  expect(selected).toContain('"answer": "They was out of"');
  await shot(page, "22-pack-line-error");

  // 直したファイルを選び直すと読み込める
  await page.getByTestId("file-input").setInputFiles({
    name: "week4.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(myPack(), null, 2)),
  });
  await expect(page.getByRole("status")).toContainText("「自分のパック」を読み込みました（2 本・8 問）");
  await expect(page.getByTestId("pack-mine")).toContainText("mine・版 1・2 本・8 問");
});

test("JSON の書き方の誤り（カンマ抜け）は行と説明を出す", async ({ page }) => {
  await page.goto("/settings");
  const lines = JSON.stringify(myPack(), null, 2).split("\n");
  const at = lines.findIndex((l) => l.includes('"title": "自分のパック"'));
  lines[at] = lines[at].replace(/,$/, ""); // 行末のカンマを消す
  await page.getByLabel("パックの JSON").fill(lines.join("\n"));
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  const alert = page.getByRole("alert").filter({ hasText: "読み込めませんでした" });
  await expect(alert).toContainText(`${at + 2}行目`);
  await expect(alert).toContainText("前の行の終わりにカンマが抜けていませんか");
  await shot(page, "23-pack-syntax-error");
});

test("同じ版は確認してから置き換える。新しい版はそのまま置き換え、消えた問題は復習から外す", async ({ page }) => {
  await page.goto("/settings");
  const box = page.getByLabel("パックの JSON");
  const load = async (p: unknown) => {
    await box.fill(JSON.stringify(p));
    await page.getByRole("button", { name: "読み込む", exact: true }).click();
  };
  await load(myPack(1));
  await expect(page.getByRole("status")).toContainText("読み込みました");

  // 復習キューに、あとで消える問題を入れておく
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("listen-shorts:v1:data")!);
    d.review = [
      { packId: "mine", clipId: "c002", itemId: "mine-sample-c002-q1", stage: 0, dueAt: "2026-01-01T00:00:00.000Z", lastAnsweredAt: "x" },
    ];
    localStorage.setItem("listen-shorts:v1:data", JSON.stringify(d));
  });
  await page.reload();

  // 同じ版：確認が出る。やめると何も変わらない
  await load(myPack(1));
  const dialog = page.getByRole("alertdialog", { name: "置き換えの確認" });
  await expect(dialog).toContainText("いまあるのは版 1、読み込むのは版 1");
  await shot(page, "24-pack-confirm");
  await dialog.getByRole("button", { name: "やめる" }).click();
  await expect(dialog).toHaveCount(0);

  // 新しい版（クリップを1本に減らす）：確認なしで置き換わり、消えた問題は復習から外れる
  const v2 = myPack(2);
  v2.clips = [v2.clips[0]];
  await load(v2);
  await expect(page.getByRole("status")).toContainText("版 1 → 2 に置き換えました（1 本・4 問）");
  const d = await saved(page);
  expect(d.packs).toHaveLength(1);
  expect(d.review).toEqual([]);

  // 古い版：確認して置き換える
  await load(myPack(1));
  await page.getByRole("alertdialog").getByRole("button", { name: "置き換える" }).click();
  await expect(page.getByRole("status")).toContainText("置き換えました（2 本・8 問）");
});

test("データを書き出せる。すべて削除は2回押し", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("パックの JSON").fill(JSON.stringify(myPack()));
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect(page.getByTestId("data-size")).toContainText("パック 1 個");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /データを書き出す/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^listen-shorts-\d{8}\.json$/);
  const body = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(body.packs[0].pack.packId).toBe("mine");

  await page.getByRole("button", { name: "すべてのデータを削除" }).click();
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByTestId("data-size")).toContainText("パック 1 個");
  await page.getByRole("button", { name: "すべてのデータを削除" }).click();
  await page.getByRole("button", { name: /本当にすべて削除/ }).click();
  await expect(page.getByTestId("data-size")).toContainText("パック 0 個");
  await expect(page.getByText("まだありません。")).toBeVisible();
});
