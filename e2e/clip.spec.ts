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
  await page.getByRole("button", { name: "🔁 文を聞く（❤️1）" }).click();
  await expect(page.getByLabel("ライフ 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "🔁 文を聞く（❤️1）" })).toBeEnabled();
  await page.getByLabel("答え").fill("arizona");
  await shot(page, "02-question");
  await page.getByRole("button", { name: "答える" }).click();
  // 1問目：コンボ1（×1.0）＋スピードボーナス
  await expect(page.getByRole("status")).toContainText("正解！（+120）");
  await shot(page, "03-feedback");
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題2：機能語の脱落で不正解
  await page.getByLabel("答え").fill("was");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toContainText("不正解（+0）");
  await expect(page.getByTestId("combo")).toHaveText("🔥 0");
  await expect(page.getByText("あなたの答え：was")).toBeVisible();
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題3：Enter で答える。正解
  await page.getByLabel("答え").fill("Called a");
  await page.getByLabel("答え").press("Enter");
  await expect(page.getByRole("status")).toContainText("正解！（+120）");
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題4：別解（it's the）で正解
  await page.getByLabel("答え").fill("it’s the");
  await page.getByRole("button", { name: "答える" }).click();
  // 2連続：100×1.2 + 20
  await expect(page.getByRole("status")).toContainText("正解！（+140）");
  await expect(page.getByTestId("score-detail")).toHaveText("🔥コンボ×1.2・⚡スピード+20");
  await page.getByRole("button", { name: "結果を見る" }).click();

  const result = page.getByTestId("result");
  await expect(result).toContainText("75%");
  // 120 + 0 + 120 + 140 + 残りライフ 2 × 30
  await expect(page.getByTestId("earned-xp")).toHaveText("+440");
  await expect(result).toContainText("あなたの答え：was（不正解）");
  await shot(page, "04-result");
  await expect(page.getByTestId("total-points")).toHaveText("440 XP");

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
  expect(saved.clipResults[0]).toMatchObject({ points: 440, lifeBonus: 60, livesLeft: 2, maxCombo: 2 });
  expect(saved.progress).toEqual({ combo: 2 });

  // 次のクリップへ
  await page.getByRole("button", { name: "次のクリップ ↑" }).click();
  await expect(page.getByText("サンプル2：新しいカフェ")).toBeVisible();

  // 再読み込みしても XP が残る
  await page.reload();
  await expect(page.getByTestId("total-points")).toHaveText("440 XP");
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

async function loadOnlyClip(page: Page, clipIndex: number, packId: string) {
  const sample = JSON.parse(
    readFileSync(path.join(__dirname, "../src/data/sample-pack.json"), "utf8"),
  );
  const p = structuredClone(sample);
  p.packId = packId;
  p.clips = [p.clips[clipIndex]];
  for (const item of p.clips[0].items) item.itemId = `${packId}-${item.itemId}`;
  await page.goto("/packs");
  await page.getByLabel("パックの JSON").fill(JSON.stringify(p));
  await page.getByRole("button", { name: "読み込む" }).click();
  await page.getByRole("link", { name: "← クイズへ" }).click();
}

test("3形式が混ざったクリップを、ヒント・ライフ・コンボを使って解ける", async ({ page }) => {
  await setup(page);
  await loadOnlyClip(page, 1, "mixed");
  await expect(page.getByText("サンプル2：新しいカフェ")).toBeVisible();
  await page.getByRole("button", { name: "▶ タップして再生" }).click();
  await page.getByRole("button", { name: "クイズへ進む" }).click();

  // 問題1（穴埋め）：ヒントを使い、短縮形を展開して答える → 100 × 0.5
  await expect(page.getByText("問題 1 / 4・聞こえた語を入力")).toBeVisible();
  await expect(page.getByTestId("speed")).toContainText("秒");
  await page.getByRole("button", { name: /ヒント/ }).click();
  await expect(page.getByTestId("hint")).toHaveText("ヒント：T______ a");
  await page.getByLabel("答え").fill("there is a");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toContainText("正解！（+50）");
  await expect(page.getByTestId("score-detail")).toHaveText("ヒントで半分");
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題2（聞き分け）：2連続 → 100 × 1.2 + 20
  await expect(page.getByText("問題 2 / 4・聞こえた方を選ぶ")).toBeVisible();
  await shot(page, "08-choice");
  await page.getByRole("group", { name: "選択肢" }).getByRole("button", { name: "light" }).click();
  await expect(page.getByRole("status")).toContainText("正解！（+140）");
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題3（並べ替え）：一度まちがえて戻し、正しく並べる → 3連続 100 × 1.5 + 20
  await expect(page.getByText("問題 3 / 4・聞こえた順に並べる")).toBeVisible();
  const cards = page.getByLabel("語のカード");
  const placed = page.getByTestId("order-placed");
  await expect(page.getByRole("button", { name: "答える" })).toBeDisabled();
  await cards.getByRole("button", { name: "been", exact: true }).click();
  await placed.getByRole("button", { name: "been", exact: true }).click();
  for (const w of ["so", "I've", "been"]) {
    await cards.getByRole("button", { name: w, exact: true }).click();
  }
  await shot(page, "09-order");
  await cards.getByRole("button", { name: "working", exact: true }).click();
  await expect(placed).toHaveText("soI'vebeenworking");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toContainText("正解！（+170）");
  await expect(page.getByTestId("combo")).toHaveText("🔥 3 連続（×1.5）");
  await page.getByRole("button", { name: "次の問題" }).click();

  // 問題4（穴埋め）：全体の見直しでライフ2、文の聞き直しでライフ1。0 になったら押せない
  await page.getByRole("button", { name: "📺 全体（❤️2）" }).click();
  await expect(page.getByLabel("ライフ 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "📺 全体（❤️2）" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "🔁 文を聞く（❤️1）" })).toBeEnabled();
  await page.getByRole("button", { name: "🔁 文を聞く（❤️1）" }).click();
  await expect(page.getByLabel("ライフ 0")).toBeVisible();
  await expect(page.getByRole("button", { name: "🔁 文を聞く（❤️1）" })).toBeDisabled();
  await page.getByLabel("答え").fill("they were out");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByRole("status")).toContainText("不正解（+0）");
  await page.getByRole("button", { name: "結果を見る" }).click();

  // 50 + 140 + 170 + 0、ライフは残っていない
  await expect(page.getByTestId("earned-xp")).toHaveText("+360");
  await expect(page.getByTestId("result")).toContainText("最大コンボ3");
  await shot(page, "10-result-m2");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("listen-shorts:v1:data") ?? "{}"),
  );
  expect(saved.answers.map((a: { type: string; hintUsed: boolean; replays: number }) => [a.type, a.hintUsed, a.replays])).toEqual([
    ["cloze", true, 0],
    ["choice", false, 0],
    ["order", false, 0],
    ["cloze", false, 2],
  ]);
  expect(saved.progress.combo).toBe(0);
});

test("再挑戦は XP が半分", async ({ page }) => {
  await setup(page);
  await loadOnlyClip(page, 0, "again");
  for (let round = 0; round < 2; round++) {
    await page.getByRole("button", { name: "▶ タップして再生" }).click();
    await page.getByRole("button", { name: "クイズへ進む" }).click();
    for (const a of ["Arizona", "it was", "called a", "it was the"]) {
      await page.getByLabel("答え").fill(a);
      await page.getByRole("button", { name: "答える" }).click();
      await page.getByRole("button", { name: /次の問題|結果を見る/ }).click();
    }
    if (round === 0) {
      // 120 + 140 + 170 + 220 + 90
      await expect(page.getByTestId("earned-xp")).toHaveText("+740");
      // 次のクリップ（サンプル）を飛ばして同じクリップに戻る
      await page.getByRole("button", { name: "次のクリップ ↑" }).click();
      await page.getByRole("button", { name: "▶ タップして再生" }).click();
      await page.getByRole("button", { name: "クイズへ進む" }).click();
      await page.goto("/");
      await expect(page.getByText("・再挑戦（XP 半分）")).toBeVisible();
    }
  }
  // コンボは続いている（4 → 8 連続、すべて ×2.0）：(220 × 4) / 2 + 45
  await expect(page.getByTestId("earned-xp")).toHaveText("+485");
});
