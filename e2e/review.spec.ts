import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fakeYouTube = readFileSync(path.join(__dirname, "fake-youtube.js"), "utf8");
const shots = process.env.SHOTS_DIR;

async function setup(page: Page) {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeYouTube }),
  );
}
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("listen-shorts:v1:data") ?? "{}"));

test("間違えた問題が翌日（午前4時以降）の復習に出て、正解すると3日後に回る", async ({ page }) => {
  await setup(page);
  // 1日目の夜。時計を固定する（タイマーは動かしたまま）
  await page.clock.setFixedTime(new Date("2026-11-22T23:30:00+09:00"));
  await page.goto("/");

  await page.getByRole("button", { name: "▶ タップして再生" }).click();
  await page.getByRole("button", { name: "クイズへ進む" }).click();
  // 1問目：L/R を取り違えて不正解、2問目：惜しい、残りは正解
  for (const a of ["Alizona", "it wsa", "called a", "it was the"]) {
    await page.getByLabel("答え").fill(a);
    await page.getByRole("button", { name: "答える" }).click();
    await page.getByRole("button", { name: /次の問題|結果を見る/ }).click();
  }
  await expect(page.getByTestId("result")).toBeVisible();

  let d = await saved(page);
  expect(d.review.map((e: { itemId: string; stage: number; dueAt: string }) => [e.itemId, e.stage, e.dueAt])).toEqual([
    ["sample-c001-q1", 0, "2026-11-22T19:00:00.000Z"], // 11/23 04:00 JST
    ["sample-c001-q2", 0, "2026-11-22T19:00:00.000Z"],
  ]);
  // 「it wsa」は語数が同じで綴りが違うが、was は5文字未満なので惜しいではなく不正解
  expect(d.answers[1].verdict).toBe("wrong");

  await page.getByRole("link", { name: /復習/ }).click();
  await expect(page.getByTestId("due-count")).toHaveText("0 問");
  await expect(page.getByText(/次は 11\/23\(月\) に 2 問です/)).toBeVisible();
  await expect(page.getByTestId("due-badge")).toHaveCount(0);

  // 翌日の深夜3時：まだ前の日なので出ない
  await page.clock.setFixedTime(new Date("2026-11-23T03:00:00+09:00"));
  await page.reload();
  await expect(page.getByTestId("due-count")).toHaveText("0 問");

  // 翌日の朝5時：2問出る
  await page.clock.setFixedTime(new Date("2026-11-23T05:00:00+09:00"));
  await page.reload();
  await expect(page.getByTestId("due-count")).toHaveText("2 問");
  await expect(page.getByTestId("due-badge")).toHaveText("2");
  await shot(page, "15-review-start");
  await page.getByRole("button", { name: "復習を始める" }).click();

  // 1問目：聞き直しは無料で何回でも
  await expect(page.getByText(/復習 1 \/ 2/)).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "🔁 文を聞く" }).click();
    await expect(page.getByRole("button", { name: "🔁 文を聞く" })).toBeEnabled();
  }
  await page.getByLabel("答え").fill("Arizona");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toContainText("正解！（+50）");
  await expect(page.getByTestId("next-review")).toHaveText("次の復習は 3日後");
  await shot(page, "16-review-feedback");
  await page.getByRole("button", { name: "次へ" }).click();

  // 2問目：ヒントを使ってまた不正解 → 最初に戻る
  await page.getByRole("button", { name: /ヒント/ }).click();
  await page.getByLabel("答え").fill("it is");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toContainText("不正解（+0）");
  await expect(page.getByTestId("next-review")).toHaveText("最初に戻りました。次の復習は1日後");
  await page.getByRole("button", { name: "次へ" }).click();

  await expect(page.getByTestId("review-summary")).toContainText("1 / 2 正解");
  await expect(page.getByTestId("review-summary")).toContainText("+50 XP");
  await shot(page, "17-review-summary");

  d = await saved(page);
  const byItem = Object.fromEntries(
    d.review.map((e: { itemId: string; stage: number; dueAt: string }) => [e.itemId, [e.stage, e.dueAt]]),
  );
  expect(byItem).toEqual({
    "sample-c001-q1": [1, "2026-11-25T19:00:00.000Z"], // 11/26 04:00 JST
    "sample-c001-q2": [0, "2026-11-23T19:00:00.000Z"], // 11/24 04:00 JST
  });
  const review = d.answers.filter((a: { source: string }) => a.source === "review");
  expect(review.map((a: { replays: number; hintUsed: boolean; points: number }) => [a.replays, a.hintUsed, a.points])).toEqual([
    [3, false, 50],
    [0, true, 0],
  ]);

  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("due-count")).toHaveText("0 問");
  await expect(page.getByTestId("due-badge")).toHaveCount(0);
});

test("パックを削除すると、その問題は復習から外れる", async ({ page }) => {
  await setup(page);
  await page.clock.setFixedTime(new Date("2026-11-22T12:00:00+09:00"));
  const sample = JSON.parse(
    readFileSync(path.join(__dirname, "../src/data/sample-pack.json"), "utf8"),
  );
  const p = structuredClone(sample);
  p.packId = "gone";
  p.title = "消すパック";
  p.clips = [p.clips[0]];
  for (const item of p.clips[0].items) item.itemId = `gone-${item.itemId}`;
  await page.goto("/settings");
  await page.getByLabel("パックの JSON").fill(JSON.stringify(p));
  await page.getByRole("button", { name: "読み込む" }).click();
  await page.getByRole("link", { name: /フィード/ }).click();
  await page.getByRole("button", { name: "▶ タップして再生" }).click();
  await page.getByRole("button", { name: "クイズへ進む" }).click();
  await page.getByLabel("答え").fill("x");
  await page.getByRole("button", { name: "答える" }).click();
  expect((await saved(page)).review).toHaveLength(1);

  await page.getByRole("button", { name: "次の問題" }).click();
  // クイズ中はタブを移れる（スワイプだけ止めている）。設定で削除
  await page.getByRole("link", { name: /設定/ }).click();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "本当に削除" }).click();
  expect((await saved(page)).review).toHaveLength(0);
});
