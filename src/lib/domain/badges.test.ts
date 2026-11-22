import { describe, expect, it } from "vitest";
import { BADGES, buildBadgeContext, earnedBadgeIds, newBadges } from "./badges";
import type { AnswerLog, ClipResult } from "./records";

let n = 0;
function ans(over: Partial<AnswerLog> = {}): AnswerLog {
  n++;
  return {
    id: `a${n}`,
    answeredAt: `2026-11-22T00:00:${String(n).padStart(2, "0")}.000Z`,
    source: "feed",
    packId: "p",
    clipId: "c1",
    itemId: `i${n}`,
    type: "cloze",
    tags: ["other"],
    accent: "US",
    difficulty: 2,
    input: "x",
    verdict: "correct",
    replays: 0,
    elapsedMs: 1000,
    hintUsed: false,
    speedBonus: 20,
    points: 100,
    ...over,
  };
}
function result(over: Partial<ClipResult> = {}): ClipResult {
  return {
    id: "s1",
    finishedAt: "2026-11-22T00:01:00.000Z",
    packId: "p",
    clipId: "c1",
    source: "feed",
    total: 3,
    correct: 2,
    points: 200,
    lifeBonus: 0,
    livesLeft: 0,
    maxCombo: 1,
    ...over,
  };
}
const earned = (answers: AnswerLog[], clipResults: ClipResult[]) =>
  earnedBadgeIds(buildBadgeContext({ answers, clipResults }));

describe("バッジ", () => {
  it("ID は重複しない", () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });

  it("何もなければ何も取れない", () => {
    expect(earned([], [])).toEqual([]);
  });

  it("初クリア", () => {
    expect(earned([], [result()])).toEqual(["first_clear"]);
  });

  it("L/R マスター：l_r の問題に10問連続正解。間にほかのタグがあってもよい。惜しいで切れる", () => {
    const lr = (v: AnswerLog["verdict"] = "correct") => ans({ tags: ["l_r"], verdict: v });
    const nine = Array.from({ length: 9 }, () => lr());
    expect(earned([...nine, ans({ verdict: "wrong" }), lr()], [])).toContain("lr_master");
    expect(earned([...nine, lr("close"), lr()], [])).not.toContain("lr_master");
    const ctx = buildBadgeContext({ answers: [...nine, lr("close"), lr()], clipResults: [] });
    expect(BADGES.find((b) => b.id === "lr_master")!.progress(ctx)).toEqual([9, 10]);
  });

  it("機能語ハンター：累計50問", () => {
    const fw = Array.from({ length: 49 }, () => ans({ tags: ["function_word", "linking"] }));
    expect(earned(fw, [])).not.toContain("function_hunter");
    expect(earned([...fw, ans({ tags: ["function_word"] })], [])).toContain("function_hunter");
  });

  it("ノーミスクリアとライフ温存", () => {
    expect(earned([], [result({ correct: 3, livesLeft: 1 })])).toEqual(["first_clear", "no_miss"]);
    expect(earned([], [result({ correct: 3, livesLeft: 3 })])).toEqual([
      "first_clear",
      "no_miss",
      "life_saver",
    ]);
  });

  it("イギリス英語 10本：同じクリップは1本と数える", () => {
    const answers = Array.from({ length: 10 }, (_, i) => ans({ clipId: `uk${i}`, accent: "UK" }));
    const nine = Array.from({ length: 9 }, (_, i) => result({ id: `r${i}`, clipId: `uk${i}` }));
    expect(earned(answers, [...nine, result({ id: "dup", clipId: "uk0" })])).not.toContain("uk_10");
    expect(earned(answers, [...nine, result({ id: "r9", clipId: "uk9" })])).toContain("uk_10");
  });

  it("パーフェクトコンボ：1本の全問がヒントなし・スピードボーナスつきの正解", () => {
    const good = [1, 2, 3].map(() => ans({ sessionId: "s1" }));
    expect(earned(good, [result({ correct: 3 })])).toContain("perfect_combo");
    const slow = [ans({ sessionId: "s1" }), ans({ sessionId: "s1", speedBonus: 0 })];
    expect(earned(slow, [result()])).not.toContain("perfect_combo");
    // 解き終えていない（clipResults にない）回は数えない
    expect(earned(good, [])).not.toContain("perfect_combo");
  });

  it("newBadges：持っているものは除く", () => {
    const data = {
      answers: [],
      clipResults: [result({ correct: 3 })],
      progress: { combo: 0, badges: [{ id: "first_clear", earnedAt: "t" }] },
    };
    expect(newBadges(data).map((b) => b.id)).toEqual(["no_miss"]);
  });
});
