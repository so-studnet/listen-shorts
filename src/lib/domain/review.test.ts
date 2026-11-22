import { describe, expect, it } from "vitest";
import {
  applyAnswer,
  dueAfterDays,
  dueEntries,
  logicalDayStart,
  nextDue,
  removePackFromQueue,
  reviewPoints,
  type ReviewEntry,
} from "./review";

// テストは TZ=Asia/Tokyo で動かす（vitest.config.mts）
const jst = (s: string) => new Date(`${s}+09:00`);
const ref = { packId: "p", clipId: "c", itemId: "q1" };

describe("日付の区切り（午前4時）", () => {
  it("4時より前は前の日", () => {
    expect(logicalDayStart(jst("2026-11-22T03:59:00"))).toEqual(jst("2026-11-21T04:00:00"));
    expect(logicalDayStart(jst("2026-11-22T04:00:00"))).toEqual(jst("2026-11-22T04:00:00"));
    expect(logicalDayStart(jst("2026-11-22T23:30:00"))).toEqual(jst("2026-11-22T04:00:00"));
  });
  it("夜遅くに間違えた問題は、翌朝4時以降に出る", () => {
    expect(dueAfterDays(jst("2026-11-22T23:30:00"), 1)).toEqual(jst("2026-11-23T04:00:00"));
    // 深夜2時は前の日の扱いなので、その日の朝4時に出る
    expect(dueAfterDays(jst("2026-11-23T02:00:00"), 1)).toEqual(jst("2026-11-23T04:00:00"));
  });
  it("月をまたぐ", () => {
    expect(dueAfterDays(jst("2026-11-30T12:00:00"), 3)).toEqual(jst("2026-12-03T04:00:00"));
  });
});

describe("applyAnswer", () => {
  const now = jst("2026-11-22T12:00:00");

  it("フィードで不正解・惜しいなら最初の段（1日後）に入る", () => {
    for (const v of ["wrong", "close"] as const) {
      expect(applyAnswer([], ref, v, "feed", now)).toEqual([
        {
          ...ref,
          stage: 0,
          dueAt: jst("2026-11-23T04:00:00").toISOString(),
          lastAnsweredAt: now.toISOString(),
        },
      ]);
    }
  });

  it("フィードで正解しても何もしない（入っていても段は変えない）", () => {
    const q = applyAnswer([], ref, "wrong", "feed", now);
    expect(applyAnswer([], ref, "correct", "feed", now)).toEqual([]);
    expect(applyAnswer(q, ref, "correct", "retry", now)).toEqual(q);
  });

  it("復習で正解すると 1→3→7→14→30 日と進み、30日の段で正解したら卒業", () => {
    let q: ReviewEntry[] = applyAnswer([], ref, "wrong", "feed", now);
    const days: string[] = [];
    let t = now;
    for (let i = 0; i < 4; i++) {
      t = new Date(q[0].dueAt);
      q = applyAnswer(q, ref, "correct", "review", t);
      days.push(`${q[0].stage}:${q[0].dueAt}`);
    }
    expect(days).toEqual([
      `1:${jst("2026-11-26T04:00:00").toISOString()}`,
      `2:${jst("2026-12-03T04:00:00").toISOString()}`,
      `3:${jst("2026-12-17T04:00:00").toISOString()}`,
      `4:${jst("2027-01-16T04:00:00").toISOString()}`,
    ]);
    expect(applyAnswer(q, ref, "correct", "review", new Date(q[0].dueAt))).toEqual([]);
  });

  it("復習で不正解・惜しいなら最初の段に戻る", () => {
    const q: ReviewEntry[] = [
      { ...ref, stage: 3, dueAt: now.toISOString(), lastAnsweredAt: "x" },
    ];
    expect(applyAnswer(q, ref, "close", "review", now)[0].stage).toBe(0);
  });

  it("ほかの問題は変えない。元の配列も変えない", () => {
    const other = { packId: "p", clipId: "c", itemId: "q2" };
    const q = applyAnswer([], other, "wrong", "feed", now);
    const q2 = applyAnswer(q, ref, "wrong", "feed", now);
    expect(q).toHaveLength(1);
    expect(q2.map((e) => e.itemId)).toEqual(["q2", "q1"]);
  });
});

describe("dueEntries / nextDue / removePackFromQueue", () => {
  const e = (itemId: string, dueAt: string, packId = "p"): ReviewEntry => ({
    packId,
    clipId: "c",
    itemId,
    stage: 0,
    dueAt: jst(dueAt).toISOString(),
    lastAnsweredAt: "x",
  });
  const q = [e("b", "2026-11-23T04:00:00"), e("a", "2026-11-22T04:00:00"), e("c", "2026-11-25T04:00:00"), e("d", "2026-11-25T04:00:00", "other")];

  it("期日が来たものを古い順に", () => {
    expect(dueEntries(q, jst("2026-11-23T05:00:00")).map((x) => x.itemId)).toEqual(["a", "b"]);
    expect(dueEntries(q, jst("2026-11-23T03:59:00")).map((x) => x.itemId)).toEqual(["a"]);
  });
  it("次の期日と件数", () => {
    expect(nextDue(q, jst("2026-11-23T05:00:00"))).toEqual({ at: jst("2026-11-25T04:00:00"), count: 2 });
    expect(nextDue([], jst("2026-11-23T05:00:00"))).toBeNull();
  });
  it("パックを消したら外す", () => {
    expect(removePackFromQueue(q, "other").map((x) => x.itemId)).toEqual(["b", "a", "c"]);
  });
});

describe("reviewPoints", () => {
  it("基本点の半分、ヒントでさらに半分", () => {
    expect(reviewPoints("correct", false)).toBe(50);
    expect(reviewPoints("correct", true)).toBe(25);
    expect(reviewPoints("close", false)).toBe(25);
    expect(reviewPoints("wrong", false)).toBe(0);
  });
});
