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

test("サンプルのクリップ1本を穴埋めで最後まで解ける", async ({ page }) => {
  await setup(page);
  await page.goto("/");

  const play = page.getByRole("button", { name: "▶ タップして再生" });
  await expect(play).toBeEnabled();
  await shot(page, "01-watch");
  await play.click();

  // クリップ全体（10〜40秒）を再生して、終わりで止まる
  await expect(page.getByRole("button", { name: "クイズへ進む" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __yt: { calls: unknown[][] } }).__yt.calls.find((c) => c[0] === "pauseVideo")))
    .toBeTruthy();
  const calls = await page.evaluate(() => (window as unknown as { __yt: { calls: unknown[][] } }).__yt.calls);
  expect(calls[0]).toEqual(["seekTo", 10]);
  const paused = calls.find((c) => c[0] === "pauseVideo")![1] as number;
  expect(paused).toBeGreaterThanOrEqual(40.3);
  expect(paused).toBeLessThan(43);

  await page.getByRole("button", { name: "クイズへ進む" }).click();

  // 問題1：正解
  await expect(page.getByText("問題 1 / 4")).toBeVisible();
  await page.getByRole("button", { name: "🔁 この文を聞き直す" }).click();
  await expect(page.getByRole("button", { name: "🔁 この文を聞き直す" })).toBeEnabled();
  await page.getByLabel("答え").fill("arizona");
  await shot(page, "02-question");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toHaveText("正解！（+100）");
  await shot(page, "03-feedback");
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題2：機能語の脱落で不正解
  await page.getByLabel("答え").fill("was");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toHaveText("不正解（+0）");
  await expect(page.getByText("あなたの答え：was")).toBeVisible();
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題3：Enter で答える。正解
  await page.getByLabel("答え").fill("Called a");
  await page.getByLabel("答え").press("Enter");
  await expect(page.getByRole("status")).toHaveText("正解！（+100）");
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題4：別解（it's the）で正解
  await page.getByLabel("答え").fill("it’s the");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toHaveText("正解！（+100）");
  await page.getByRole("button", { name: "結果を見る" }).click();

  const result = page.getByTestId("result");
  await expect(result).toContainText("75%");
  await expect(result).toContainText("300");
  await expect(result).toContainText("あなたの答え：was（不正解）");
  await shot(page, "04-result");
  await expect(page.getByTestId("total-points")).toHaveText("300 XP");

  // 保存されている
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("listen-shorts:v1:data") ?? "{}"),
  );
  expect(saved.answers).toHaveLength(4);
  expect(saved.answers[0]).toMatchObject({
    source: "feed",
    itemId: "sample-c001-q1",
    verdict: "correct",
    replays: 1,
    tags: ["l_r"],
  });
  expect(saved.clipResults).toHaveLength(1);

  // 次のクリップへ
  await page.getByRole("button", { name: "次のクリップ ↑" }).click();
  await expect(page.getByText("サンプル2：新しいカフェ")).toBeVisible();

  // 再読み込みしても XP が残る
  await page.reload();
  await expect(page.getByTestId("total-points")).toHaveText("300 XP");
});

test("パックを貼り付けて読み込める。エラーは場所つきで出る", async ({ page }) => {
  await setup(page);
  await page.goto("/packs");
  const sample = JSON.parse(
    readFileSync(path.join(__dirname, "../src/data/sample-pack.json"), "utf8"),
  );

  const broken = structuredClone(sample);
  broken.packId = "mine";
  broken.clips[0].items[0].answer = "Alizona";
  await page.getByLabel("パックの JSON").fill(JSON.stringify(broken, null, 2));
  await page.getByRole("button", { name: "読み込む" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "読み込めませんでした" })).toContainText(
    'clips[0].items[0].answer：文の中に"Alizona" が見つかりません',
  );
  await shot(page, "05-pack-error");

  const ok = structuredClone(sample);
  ok.packId = "mine";
  ok.title = "自分のパック";
  ok.clips = [ok.clips[2]];
  for (const item of ok.clips[0].items) item.itemId = "mine-" + item.itemId;
  await page.getByLabel("パックの JSON").fill(JSON.stringify(ok));
  await page.getByRole("button", { name: "読み込む" }).click();
  await expect(page.getByRole("status")).toContainText("「自分のパック」を読み込みました（1 本・4 問）");
  await shot(page, "06-pack-loaded");

  await page.getByRole("link", { name: "← クイズへ" }).click();
  await expect(page.getByText("サンプル3：ニュースの話")).toBeVisible();
  await expect(page.getByText("クリップ 1 / 4")).toBeVisible();

  // 削除は2回押し
  await page.goto("/packs");
  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "本当に削除" }).click();
  await expect(page.getByText("まだありません。")).toBeVisible();
});

test("動画が再生できないときは説明を出し、クイズへ進める", async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("YouTube のプレーヤーを読み込めませんでした")).toBeVisible();
  await page.getByRole("button", { name: "クイズへ進む" }).click();
  await expect(page.getByText("問題 1 / 4")).toBeVisible();
});

test("埋め込みできない動画は説明を出し、再生ボタンを隠す", async ({ page }) => {
  await setup(page);
  await page.goto("/packs");
  const sample = JSON.parse(
    readFileSync(path.join(__dirname, "../src/data/sample-pack.json"), "utf8"),
  );
  const p = structuredClone(sample);
  p.packId = "err";
  p.clips = [p.clips[0]];
  p.clips[0].videoId = "ERRXXXXXXXX";
  for (const item of p.clips[0].items) item.itemId = "err-" + item.itemId;
  await page.getByLabel("パックの JSON").fill(JSON.stringify(p));
  await page.getByRole("button", { name: "読み込む" }).click();
  await page.getByRole("link", { name: "← クイズへ" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "この動画は再生できません" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "▶ タップして再生" })).toHaveCount(0);
  await shot(page, "07-embed-error");
  await page.getByRole("button", { name: "クイズへ進む" }).click();
  await expect(page.getByText("問題 1 / 4")).toBeVisible();
});
