import { describe, expect, it } from "vitest";
import type { Clip } from "./pack";
import { initQuiz, quizReducer, summarize, type QuizState } from "./quiz";

const clip: Clip = {
  clipId: "c1",
  videoId: "AAAAAAAAAAA",
  start: 0,
  end: 20,
  title: "t",
  channel: "ch",
  accent: "US",
  difficulty: 2,
  sentences: [{ sid: "s1", start: 0, end: 5, text: "I was in the park." }],
  items: [
    {
      itemId: "q1",
      type: "cloze",
      sid: "s1",
      answer: "was",
      tags: ["function_word"],
      note: "n",
    },
    {
      itemId: "q2",
      type: "choice",
      sid: "s1",
      answer: "park",
      options: ["park", "pork"],
      tags: ["vocab"],
      note: "n",
    },
    {
      itemId: "q3",
      type: "cloze",
      sid: "s1",
      answer: "the park",
      tags: ["function_word"],
      note: "n",
    },
  ],
};

function run(state: QuizState, ...actions: Parameters<typeof quizReducer>[1][]) {
  return actions.reduce(quizReducer, state);
}

describe("quiz", () => {
  it("M1 では穴埋めだけを出す", () => {
    expect(initQuiz(clip).items.map((i) => i.itemId)).toEqual(["q1", "q3"]);
  });

  it("視聴 → 問題 → 解答 → 次 → 結果", () => {
    let s = run(initQuiz(clip), { type: "startQuiz", now: 1000 });
    expect(s.phase).toEqual({ kind: "question", shownAt: 1000, replays: 0 });

    s = run(s, { type: "replaySentence" }, { type: "replaySentence" });
    s = run(s, { type: "submit", input: "Was", now: 4000 });
    expect(s.phase.kind).toBe("feedback");
    expect(s.results[0]).toEqual({
      itemId: "q1",
      input: "Was",
      verdict: "correct",
      points: 100,
      replays: 2,
      elapsedMs: 3000,
    });

    s = run(s, { type: "next", now: 5000 });
    expect(s.index).toBe(1);
    expect(s.phase).toEqual({ kind: "question", shownAt: 5000, replays: 0 });

    s = run(s, { type: "submit", input: "park", now: 6000 });
    expect(s.results[1].verdict).toBe("wrong");
    s = run(s, { type: "next", now: 7000 });
    expect(s.phase.kind).toBe("result");
    expect(summarize(s.results)).toEqual({
      total: 2,
      correct: 1,
      close: 0,
      wrong: 1,
      points: 100,
    });
  });

  it("その段階で受け付けない操作は無視する", () => {
    const s0 = initQuiz(clip);
    expect(quizReducer(s0, { type: "submit", input: "x", now: 0 })).toBe(s0);
    expect(quizReducer(s0, { type: "next", now: 0 })).toBe(s0);
  });

  it("出せる問題がなければすぐ結果", () => {
    const only = { ...clip, items: [clip.items[1]] };
    const s = quizReducer(initQuiz(only), { type: "startQuiz", now: 0 });
    expect(s.phase.kind).toBe("result");
  });
});
