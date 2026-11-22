import { expect, test, type Page } from "@playwright/test";

const shots = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

type Verdict = "correct" | "close" | "wrong";

/** 8週ぶんの解答記録を作る。週を追うごとに L/R と機能語の正答率が上がるようにする。 */
function seedAnswers() {
  const answers: Record<string, unknown>[] = [];
  let n = 0;
  // 2026-11-25（水）12:00 JST を「いま」とし、その週と前の7週
  const base = new Date("2026-11-25T12:00:00+09:00").getTime();
  for (let w = 7; w >= 0; w--) {
    if (w === 5) continue; // 解答のない週（線が切れる）
    const at = new Date(base - w * 7 * 86400_000).toISOString();
    const add = (tags: string[], verdict: Verdict, accent = "US") =>
      answers.push({
        id: `a${++n}`,
        answeredAt: at,
        source: "feed",
        packId: "sample",
        clipId: "c001",
        itemId: `i${n}`,
        type: "cloze",
        tags,
        accent,
        difficulty: 2,
        input: "x",
        verdict,
        replays: 0,
        elapsedMs: 1000,
        hintUsed: false,
        speedBonus: 0,
        points: verdict === "correct" ? 100 : verdict === "close" ? 50 : 0,
      });
    const progress = 7 - w; // 0..7
    for (let i = 0; i < 4; i++) add(["l_r"], i < progress / 2 ? "correct" : "wrong", "UK");
    for (let i = 0; i < 4; i++)
      add(["function_word", "linking"], i < 1 + progress / 3 ? "correct" : i === 3 ? "close" : "wrong");
  }
  return answers;
}

test("記録：週ごと・誤りの種類ごと・アクセント別の正答率", async ({ page }) => {
  const answers = seedAnswers();
  await page.addInitScript((data) => {
    if (!localStorage.getItem("listen-shorts:v1:data"))
      localStorage.setItem("listen-shorts:v1:data", JSON.stringify(data));
  }, { answers });
  await page.clock.setFixedTime(new Date("2026-11-25T12:00:00+09:00"));
  await page.goto("/stats");

  // 全体：56問
  const total = answers.length;
  const correct = answers.filter((a) => a.verdict === "correct").length;
  await expect(page.getByTestId("stats-rate")).toHaveText(`${Math.round((correct / total) * 100)}%`);

  // 週ごと：表で見る
  const weekly = page.getByTestId("weekly");
  await weekly.getByText("表で見る").click();
  await expect(weekly.locator("tbody tr")).toHaveCount(8);
  await expect(weekly.locator("tbody tr").nth(0)).toContainText("10/5〜");
  await expect(weekly.locator("tbody tr").nth(2)).toContainText("—"); // 解答のない週
  await expect(weekly.locator("tbody tr").nth(7)).toContainText("11/23〜");

  // 点に触るとツールチップ
  const svg = weekly.locator("svg");
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2);
  await expect(weekly.getByRole("tooltip")).toContainText("11/23");
  await expect(weekly.getByRole("tooltip")).toContainText("8問中");
  await shot(page, "18-stats-tooltip");
  await page.mouse.move(0, 0);

  // 誤りの種類：L と R は 4問×7週 = 28問
  await expect(page.getByTestId("tag-l_r")).toContainText("28問");
  await expect(page.getByTestId("tag-vocab")).toContainText("解答なし");
  if (shots) await page.getByTestId("by-tag").screenshot({ path: `${shots}/21-stats-tags.png` });

  // アクセント別：触ると内訳
  const accent = page.getByTestId("by-accent");
  await accent.getByRole("button", { name: /^UK/ }).click();
  await expect(page.getByTestId("bar-detail")).toContainText("UK：28問中");
  await expect(accent.getByRole("button", { name: /^AU/ })).toContainText("解答なし");
  await shot(page, "19-stats-light");

  await page.emulateMedia({ colorScheme: "dark" });
  await shot(page, "20-stats-dark");
});

test("記録：解答がなければ案内を出す", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByText("まだ解答がありません")).toBeVisible();
  await expect(page.getByTestId("weekly")).toHaveCount(0);
});
