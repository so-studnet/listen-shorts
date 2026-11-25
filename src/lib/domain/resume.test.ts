import { describe, expect, it } from "vitest";
import type { Clip } from "./pack";
import { initQuiz, quizReducer, type QuizAction, type QuizState } from "./quiz";
import { isUsable, parseSaved, restoreQuiz, toSaved, type SessionInfo } from "./resume";

const clip: Clip = {
  clipId: "c1",
  videoId: "AAAAAAAAAAA",
  start: 0,
  end: 20,
  title: "t",
  channel: "ch",
  accent: "US",
  difficulty: 2,
  sentences: [{ sid: "s1", start: 0, end: 5, text: "I was in the park with my friend." }],
  items: [
    { itemId: "q1", type: "cloze", sid: "s1", answer: "was", tags: ["function_word"], note: "n" },
    { itemId: "q2", type: "choice", sid: "s1", answer: "park", options: ["park", "pork"], tags: ["vocab"], note: "n" },
    { itemId: "q3", type: "order", sid: "s1", answer: "with my friend", tags: ["linking"], note: "n" },
    { itemId: "q4", type: "cloze", sid: "s1", answer: "the park", tags: ["function_word"], note: "n" },
  ],
};
const info: SessionInfo = {
  owner: "u1",
  packId: "p",
  clipId: "c1",
  sessionId: "sess-1",
  source: "feed",
  xpAtOpen: 1200,
};
const run = (s: QuizState, ...a: QuizAction[]) => a.reduce(quizReducer, s);
const now = new Date("2026-11-25T10:00:00.000Z");

/** 3問目の途中まで解いた状態（ヒントを使い、文を1回聞いた） */
function midway() {
  return run(
    initQuiz(clip, { combo: 2 }),
    { type: "startQuiz", now: 0, seed: 7 },
    { type: "submit", input: "was", now: 1000 },
    { type: "next", now: 2000 },
    { type: "submit", input: "park", now: 3000 },
    { type: "next", now: 4000 },
    { type: "replaySentence", now: 4500 },
    { type: "playbackEnded", now: 6000 },
  );
}

describe("途中から再開", () => {
  it("視聴中・結果は保存しない", () => {
    expect(toSaved(initQuiz(clip), info, now)).toBeNull();
  });

  it("問題の画面で閉じたら、その問題から再開する。聞き直しは引き継ぎ、残り時間は数え直す", () => {
    const state = midway();
    const saved = toSaved(state, info, now)!;
    expect(saved).toMatchObject({ index: 2, at: "question", sentenceReplays: 1, replays: 1, combo: 4, lives: 3 });
    // JSON を通しても戻せる
    const back = restoreQuiz(parseSaved(JSON.parse(JSON.stringify(saved)))!, clip, 50_000)!;
    expect(back.index).toBe(2);
    expect(back.results.map((r) => r.itemId)).toEqual(["q1", "q2"]);
    expect(back.combo).toBe(4);
    expect(back.cards).toEqual(state.cards);
    expect(back.phase).toEqual({
      kind: "question",
      shownAt: 50_000,
      replays: 1,
      sentenceReplays: 1,
      hintUsed: false,
      pausedMs: 0,
      playbackStartedAt: null,
    });
    // 続きを解ける。2回目の文の聞き直しはライフを使う
    const next = run(back, { type: "replaySentence", now: 51_000 });
    expect(next.lives).toBe(2);
    const done = run(
      back,
      { type: "submit", input: "with my friend", now: 52_000 },
      { type: "next", now: 53_000 },
      { type: "useHint" },
      { type: "submit", input: "the park", now: 54_000 },
      { type: "next", now: 55_000 },
    );
    expect(done.phase.kind).toBe("result");
    expect(done.results).toHaveLength(4);
  });

  it("ヒントを使ってから閉じても、ヒントを使ったまま", () => {
    const s = run(midway(), { type: "next", now: 0 }); // 問題の画面なので next は無視される
    const withHint = run(s, { type: "useHint" }); // 並べ替えにはヒントはない
    expect(withHint).toBe(s);
    const q4 = run(
      s,
      { type: "submit", input: "with my friend", now: 7000 },
      { type: "next", now: 8000 },
      { type: "useHint" },
    );
    const back = restoreQuiz(toSaved(q4, info, now)!, clip, 0)!;
    expect(back.phase.kind === "question" && back.phase.hintUsed).toBe(true);
  });

  it("判定の画面で閉じたら、判定の画面から再開する", () => {
    const s = run(midway(), { type: "submit", input: "my with friend", now: 7000 });
    const saved = toSaved(s, info, now)!;
    expect(saved).toMatchObject({ at: "feedback", index: 2 });
    const back = restoreQuiz(saved, clip, 0)!;
    expect(back.phase).toEqual(s.phase);
    expect(run(back, { type: "next", now: 1 }).index).toBe(3);
  });

  it("問題の並びが変わっていたら戻さない", () => {
    const saved = toSaved(midway(), info, now)!;
    const reordered = { ...clip, items: [clip.items[1], clip.items[0], ...clip.items.slice(2)] };
    expect(restoreQuiz(saved, reordered, 0)).toBeNull();
    expect(restoreQuiz(saved, { ...clip, items: clip.items.slice(0, 2) }, 0)).toBeNull();
    const newOptions = {
      ...clip,
      items: clip.items.map((i) => (i.itemId === "q2" ? { ...i, options: ["park", "perk"] } : i)),
    } as Clip;
    expect(restoreQuiz(saved, newOptions, 0)).toBeNull();
    expect(restoreQuiz(saved, { ...clip, clipId: "other" }, 0)).toBeNull();
  });

  it("持ち主が違う・7日を過ぎた・壊れた値は使わない", () => {
    const saved = toSaved(midway(), info, now)!;
    expect(isUsable(saved, "u1", new Date("2026-12-02T09:59:00.000Z"))).toBe(true);
    expect(isUsable(saved, "u1", new Date("2026-12-02T10:01:00.000Z"))).toBe(false);
    expect(isUsable(saved, "local", now)).toBe(false);
    expect(parseSaved({ ...saved, version: 2 })).toBeNull();
    expect(parseSaved("x")).toBeNull();
  });
});
