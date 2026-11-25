import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fakeYouTube = readFileSync(path.join(__dirname, "fake-youtube.js"), "utf8");
const shots = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("listen-shorts:v1:data") ?? "{}"));
const resumeData = (page: Page) =>
  page.evaluate(() => localStorage.getItem("listen-shorts:v1:resume"));

/** サンプル2（穴埋め・聞き分け・並べ替え・穴埋めの4問）だけのパックを読み込んで、フィードを開く */
async function setup(page: Page) {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeYouTube }),
  );
  const sample = JSON.parse(readFileSync(path.join(__dirname, "../src/data/sample-pack.json"), "utf8"));
  sample.packId = "mine";
  sample.title = "自分のパック";
  sample.clips = [sample.clips[1]];
  for (const i of sample.clips[0].items) i.itemId = `mine-${i.itemId}`;
  await page.goto("/settings");
  await page.getByLabel("パックの JSON").fill(JSON.stringify(sample));
  await page.getByRole("button", { name: "読み込む", exact: true }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "▶ タップして再生" }).click();
  await page.getByRole("button", { name: "クイズへ進む" }).click();
}

test("問題の途中で閉じても、開き直すとその問題から続きを解ける", async ({ page }) => {
  await setup(page);
  // 1問目・2問目に正解して、3問目（並べ替え）で文を1回聞いたところで閉じる
  await page.getByLabel("答え").fill("there is a");
  await page.getByRole("button", { name: "答える" }).click();
  await page.getByRole("button", { name: "次の問題" }).click();
  await page.getByRole("group", { name: "選択肢" }).getByRole("button", { name: "light" }).click();
  await page.getByRole("button", { name: "次の問題" }).click();
  await expect(page.getByText("問題 3 / 4")).toBeVisible();
  await page.getByRole("button", { name: "🔁 文を聞く（無料）" }).click();
  await expect(page.getByRole("button", { name: "🔁 文を聞く（❤️1）" })).toBeEnabled();
  expect(await resumeData(page)).not.toBeNull();

  await page.reload(); // アプリを閉じて開き直す

  await expect(page.getByTestId("resumed")).toHaveText("前回の続き（問題 3 / 4）から再開しました");
  await expect(page.getByText("問題 3 / 4・聞こえた順に並べる")).toBeVisible();
  // 視聴からやり直さない。コンボとライフ、聞き直しの回数を引き継ぐ（無料の1回は使用済み）
  await expect(page.getByRole("button", { name: "▶ タップして再生" })).toHaveCount(0);
  await expect(page.getByTestId("combo")).toHaveText("🔥 2 連続（×1.2）");
  await expect(page.getByLabel("ライフ 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "🔁 文を聞く（❤️1）" })).toBeVisible();
  // クイズ中なのでスワイプは止まっている
  await expect(page.getByTestId("feed")).toHaveAttribute("data-locked", "yes");
  await shot(page, "31-resumed");

  // 続きを解く
  const cards = page.getByLabel("語のカード");
  for (const w of ["so", "I've", "been", "working"])
    await cards.getByRole("button", { name: w, exact: true }).click();
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toContainText("正解！");
  await page.getByRole("button", { name: "次の問題" }).click();
  await page.getByLabel("答え").fill("they were out of");
  await page.getByRole("button", { name: "答える" }).click();
  await page.getByRole("button", { name: "結果を見る" }).click();
  await expect(page.getByTestId("result")).toContainText("4/4");
  await expect(page.getByTestId("feed")).toHaveAttribute("data-locked", "no");

  // 記録：同じ回（sessionId）の解答が4件、結果が1件。途中経過は消える
  const d = await saved(page);
  expect(d.answers).toHaveLength(4);
  expect(new Set(d.answers.map((a: { sessionId: string }) => a.sessionId)).size).toBe(1);
  expect(d.clipResults).toHaveLength(1);
  expect(d.clipResults[0].id).toBe(d.answers[0].sessionId);
  expect(await resumeData(page)).toBeNull();

  // もう一度開いても、再開の案内は出ない
  await page.reload();
  await expect(page.getByTestId("resumed")).toHaveCount(0);
});

test("判定の画面で閉じたら判定の画面から。ヒントを使ったことも引き継ぐ", async ({ page }) => {
  await setup(page);
  await page.getByLabel("答え").fill("there is a");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toContainText("正解！");
  await page.reload();
  await expect(page.getByTestId("resumed")).toHaveText("前回の続き（問題 1 / 4）から再開しました");
  await expect(page.getByRole("status").filter({ hasText: "正解！" })).toBeVisible();
  await page.getByRole("button", { name: "次の問題" }).click();
  await page.getByRole("group", { name: "選択肢" }).getByRole("button", { name: "right" }).click();
  await page.getByRole("button", { name: "次の問題" }).click();
  // 3問目を飛ばして4問目（穴埋め）でヒントを使ってから閉じる
  const cards = page.getByLabel("語のカード");
  for (const w of ["so", "I've", "been", "working"])
    await cards.getByRole("button", { name: w, exact: true }).click();
  await page.getByRole("button", { name: "答える" }).click();
  await page.getByRole("button", { name: "次の問題" }).click();
  await page.getByRole("button", { name: /ヒント/ }).click();
  await expect(page.getByTestId("hint")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("resumed")).toHaveText("前回の続き（問題 4 / 4）から再開しました");
  await expect(page.getByTestId("hint")).toBeVisible();
  await expect(page.getByRole("button", { name: /ヒント/ })).toHaveCount(0);
  // 解答は二重にならない（3件のまま）
  expect((await saved(page)).answers).toHaveLength(3);
});

test("パックを削除したら、途中経過は捨てる", async ({ page }) => {
  await setup(page);
  await page.getByLabel("答え").fill("there is a");
  await page.getByRole("button", { name: "答える" }).click();
  expect(await resumeData(page)).not.toBeNull();
  await page.goto("/settings");
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "本当に削除" }).click();
  await page.goto("/");
  await expect(page.getByTestId("resumed")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "▶ タップして再生" })).toBeVisible();
});
