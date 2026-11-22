import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FakeSupabase, PASSWORD, USER } from "./fake-supabase";

const fakeYouTube = readFileSync(path.join(__dirname, "fake-youtube.js"), "utf8");
const shots = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function login(page: Page, password = PASSWORD) {
  await page.getByLabel("メールアドレス").fill(USER.email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

test("ログインして同期する：取り込み・保存・別の端末・エラーからの回復・ログアウト", async ({ browser }) => {
  const server = new FakeSupabase();

  // --- 端末1（ログイン前にブラウザ内に記録がある）---
  const ctx1 = await browser.newContext();
  await server.attach(ctx1);
  await ctx1.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ contentType: "text/javascript", body: fakeYouTube }),
  );
  const local = {
    answers: [
      {
        id: "old-1", answeredAt: "2026-11-20T03:00:00.000Z", source: "feed", packId: "sample", clipId: "c001",
        itemId: "sample-c001-q1", type: "cloze", tags: ["l_r"], accent: "UK", difficulty: 2, input: "Alizona",
        verdict: "wrong", replays: 0, elapsedMs: 1000, hintUsed: false, speedBonus: 0, points: 0,
      },
    ],
  };
  await ctx1.addInitScript((data) => {
    if (!localStorage.getItem("listen-shorts:v1:data"))
      localStorage.setItem("listen-shorts:v1:data", JSON.stringify(data));
  }, local);
  const p1 = await ctx1.newPage();
  await p1.goto("/");

  // ログイン画面。まちがったパスワード
  await expect(p1.getByRole("heading", { name: "ListenShorts" })).toBeVisible();
  await expect(p1.getByRole("navigation", { name: "タブ" })).toHaveCount(0);
  await shot(p1, "27-login");
  await login(p1, "wrong");
  await expect(p1.getByText("メールアドレスかパスワードが違います")).toBeVisible();
  await login(p1);

  // このブラウザの記録を取り込むか聞かれる
  const banner = p1.getByRole("dialog", { name: "このブラウザの記録の取り込み" });
  await expect(banner).toContainText("解答 1 件");
  await shot(p1, "28-import");
  await banner.getByRole("button", { name: "取り込む" }).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => server.rows("ls_answers").map((r) => r.id)).toEqual(["old-1"]);
  expect(server.rows("ls_answers")[0].user_id).toBe(USER.id);

  // フィードで1問答えると、サーバーに保存される
  await p1.getByRole("button", { name: "▶ タップして再生" }).click();
  await p1.getByRole("button", { name: "クイズへ進む" }).click();
  await p1.getByLabel("答え").fill("Arizona");
  await p1.getByRole("button", { name: "答える" }).click();
  await expect.poll(() => server.rows("ls_answers").length).toBe(2);
  await expect.poll(() => server.rows("ls_progress")[0]?.combo).toBe(1);

  // 設定：アカウント
  await p1.getByRole("button", { name: "次の問題" }).click();
  await p1.getByRole("link", { name: /設定/ }).click();
  await expect(p1.getByText(`${USER.email} でログイン中`)).toBeVisible();
  await expect(p1.getByTestId("account-status")).toHaveText("✅ 同期済み");
  await shot(p1, "29-account");

  // --- 端末2：同じアカウントでログインすると、同じ記録が見える。取り込みは聞かれない ---
  const ctx2 = await browser.newContext();
  await server.attach(ctx2);
  const p2 = await ctx2.newPage();
  await p2.goto("/stats");
  await login(p2);
  await expect(p2.getByTestId("stats-xp")).toHaveText("120");
  await expect(p2.getByRole("dialog", { name: "このブラウザの記録の取り込み" })).toHaveCount(0);

  // 端末2でパックを読み込み、端末1で読み直すと出てくる
  const sample = JSON.parse(readFileSync(path.join(__dirname, "../src/data/sample-pack.json"), "utf8"));
  sample.packId = "mine";
  sample.title = "自分のパック";
  for (const c of sample.clips) for (const i of c.items) i.itemId = `mine-${i.itemId}`;
  await p2.getByRole("link", { name: /設定/ }).click();
  await p2.getByLabel("パックの JSON").fill(JSON.stringify(sample));
  await p2.getByRole("button", { name: "読み込む", exact: true }).click();
  await expect.poll(() => server.rows("ls_packs").map((r) => r.id)).toEqual(["mine"]);
  await p1.getByRole("button", { name: "🔄 サーバーから読み直す" }).click();
  await expect(p1.getByTestId("pack-mine")).toBeVisible();

  // --- 保存に失敗したら帯が出て、読み直すと消える ---
  server.failWrites = 1;
  await p1.getByRole("button", { name: "削除", exact: true }).click();
  await p1.getByRole("button", { name: "本当に削除" }).click();
  const syncAlert = p1.getByRole("alert").filter({ hasText: "同期できませんでした" });
  await expect(syncAlert).toBeVisible();
  // サーバーから読み直して正しい状態（パックは消えていない）に戻る
  await expect(p1.getByTestId("pack-mine")).toBeVisible();
  await shot(p1, "30-sync-error");
  await syncAlert.getByRole("button", { name: "読み直す" }).click();
  await expect(syncAlert).toHaveCount(0);
  await expect(p1.getByTestId("account-status")).toHaveText("✅ 同期済み");

  // --- ログアウト ---
  await p1.getByRole("button", { name: "ログアウト" }).click();
  await p1.getByRole("button", { name: "本当にログアウト" }).click();
  await expect(p1.getByLabel("メールアドレス")).toBeVisible();
  // この端末のキャッシュは消える
  const cacheKeys = await p1.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("listen-shorts:v1:cache:")));
  expect(cacheKeys).toEqual([]);

  await ctx1.close();
  await ctx2.close();
});
