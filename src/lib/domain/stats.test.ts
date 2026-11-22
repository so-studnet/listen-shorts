import { describe, expect, it } from "vitest";
import type { AnswerLog } from "./records";
import { byAccent, byTag, overall, rate, weekStart, weekly } from "./stats";

// TZ=Asia/Tokyo（vitest.config.mts）
const jst = (s: string) => new Date(`${s}+09:00`);
let n = 0;
function ans(at: string, over: Partial<AnswerLog> = {}): AnswerLog {
  n++;
  return {
    id: `a${n}`,
    answeredAt: jst(at).toISOString(),
    source: "feed",
    packId: "p",
    clipId: "c",
    itemId: `i${n}`,
    type: "cloze",
    tags: ["other"],
    accent: "US",
    difficulty: 2,
    input: "x",
    verdict: "correct",
    replays: 0,
    elapsedMs: 0,
    hintUsed: false,
    speedBonus: 0,
    points: 100,
    ...over,
  };
}

describe("weekStart", () => {
  it("月曜の朝4時から次の月曜の朝4時まで", () => {
    // 2026-11-23 は月曜
    expect(weekStart(jst("2026-11-23T04:00:00"))).toEqual(jst("2026-11-23T04:00:00"));
    expect(weekStart(jst("2026-11-29T23:00:00"))).toEqual(jst("2026-11-23T04:00:00"));
    // 月曜の深夜3時は前の週（日曜の扱い）
    expect(weekStart(jst("2026-11-23T03:00:00"))).toEqual(jst("2026-11-16T04:00:00"));
  });
});

describe("weekly", () => {
  const now = jst("2026-11-25T12:00:00");
  const answers = [
    ans("2026-11-24T10:00:00"),
    ans("2026-11-24T10:01:00", { verdict: "close" }),
    ans("2026-11-17T10:00:00", { verdict: "wrong" }),
    ans("2026-11-01T10:00:00"), // 範囲外（4週より前）
  ];
  it("直近の週を古い順に、解答がない週は 0", () => {
    const w = weekly(answers, now, 4);
    expect(w.map((x) => [x.start.toISOString(), x.total, x.correct, x.close])).toEqual([
      [jst("2026-11-02T04:00:00").toISOString(), 0, 0, 0],
      [jst("2026-11-09T04:00:00").toISOString(), 0, 0, 0],
      [jst("2026-11-16T04:00:00").toISOString(), 1, 0, 0],
      [jst("2026-11-23T04:00:00").toISOString(), 2, 1, 1],
    ]);
  });
  it("正答率に惜しいは入れない。解答がなければ null", () => {
    const w = weekly(answers, now, 4);
    expect(w.map(rate)).toEqual([null, null, 0, 0.5]);
  });
});

describe("byTag / byAccent / overall", () => {
  const now = jst("2026-11-25T12:00:00");
  const answers = [
    ans("2026-11-24T10:00:00", { tags: ["l_r", "vocab"] }),
    ans("2026-11-24T10:01:00", { tags: ["l_r"], verdict: "wrong", accent: "UK" }),
    ans("2026-11-24T10:02:00", { tags: ["function_word"], verdict: "close", accent: "UK" }),
  ];
  it("1つの解答は付いているタグすべてに数える", () => {
    const t = Object.fromEntries(byTag(answers, now, 2).map((x) => [x.tag, x.all]));
    expect(t.l_r).toEqual({ total: 2, correct: 1, close: 0 });
    expect(t.vocab).toEqual({ total: 1, correct: 1, close: 0 });
    expect(t.function_word).toEqual({ total: 1, correct: 0, close: 1 });
    expect(t.linking).toEqual({ total: 0, correct: 0, close: 0 });
    expect(byTag(answers, now, 2)[1].weeks[1].total).toBe(2);
  });
  it("アクセント別", () => {
    expect(byAccent(answers).map((x) => [x.accent, x.all.total])).toEqual([
      ["US", 1],
      ["UK", 2],
      ["AU", 0],
      ["other", 0],
    ]);
    expect(overall(answers)).toEqual({ total: 3, correct: 1, close: 1 });
  });
});
