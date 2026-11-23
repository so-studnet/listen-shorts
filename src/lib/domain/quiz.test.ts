import { describe, expect, it } from "vitest";
import type { Clip } from "./pack";
import {
  activeElapsedMs,
  initQuiz,
  judgeItem,
  sentenceReplayCost,
  quizReducer,
  summarize,
  type QuizAction,
  type QuizState,
} from "./quiz";

const clip: Clip = {
  clipId: "c1",
  videoId: "AAAAAAAAAAA",
  start: 0,
  end: 20,
  title: "t",
  channel: "ch",
  accent: "US",
  difficulty: 2,
  sentences: [
    { sid: "s1", start: 0, end: 5, text: "I was in the park with my friend." },
  ],
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
      options: ["park", "pork", "perk"],
      tags: ["vocab"],
      note: "n",
    },
    {
      itemId: "q3",
      type: "order",
      sid: "s1",
      answer: "with my friend.",
      tags: ["linking"],
      note: "n",
    },
  ],
};

function run(state: QuizState, ...actions: QuizAction[]) {
  return actions.reduce(quizReducer, state);
}

const started = () =>
  run(initQuiz(clip), { type: "startQuiz", now: 0, seed: 7 });

describe("judgeItem", () => {
  it("聞き分けは大文字小文字を無視した完全一致", () => {
    expect(judgeItem(clip.items[1], "Park")).toBe("correct");
    expect(judgeItem(clip.items[1], "pork")).toBe("wrong");
  });
  it("並べ替えは語の順序の完全一致（句読点は無視）", () => {
    expect(judgeItem(clip.items[2], "with my friend")).toBe("correct");
    expect(judgeItem(clip.items[2], "my with friend")).toBe("wrong");
  });
});

describe("startQuiz", () => {
  it("3形式すべてを出し、選択肢とカードを混ぜる（種で決まる）", () => {
    const s = started();
    expect(s.items.map((i) => i.type)).toEqual(["cloze", "choice", "order"]);
    expect([...s.choices.q2].sort()).toEqual(["park", "perk", "pork"]);
    expect([...s.cards.q3].sort()).toEqual(["friend", "my", "with"]);
    expect(s.cards.q3.join(" ")).not.toBe("with my friend");
    expect(started().choices).toEqual(s.choices);
  });
});

describe("ライフと聞き直し", () => {
  it("文の聞き直しは各問題の初回が無料、2回目から1。全体の見直しは2。足りなければできない", () => {
    let s = started();
    expect(s.lives).toBe(3);
    expect(sentenceReplayCost(s)).toBe(0);
    s = run(s, { type: "replaySentence", now: 100 });
    expect(s.lives).toBe(3);
    // 再生中は次の聞き直しを受け付けない
    expect(run(s, { type: "replaySentence", now: 200 }).phase).toBe(s.phase);
    s = run(s, { type: "playbackEnded", now: 3100 });
    expect(sentenceReplayCost(s)).toBe(1);
    s = run(s, { type: "replaySentence", now: 3200 }, { type: "playbackEnded", now: 6000 });
    expect(s.lives).toBe(2);
    s = run(s, { type: "replayWhole", now: 7000 }, { type: "playbackEnded", now: 9000 });
    expect(s.lives).toBe(0);
    expect(run(s, { type: "replaySentence", now: 9500 })).toBe(s);
    if (s.phase.kind !== "question") throw new Error();
    expect(s.phase.replays).toBe(3);
    expect(s.phase.sentenceReplays).toBe(2);
  });

  it("全体の見直しは、文の初回の無料に数えない", () => {
    let s = run(started(), { type: "replayWhole", now: 0 }, { type: "playbackEnded", now: 100 });
    expect(s.lives).toBe(1);
    expect(sentenceReplayCost(s)).toBe(0);
    s = run(s, { type: "replaySentence", now: 200 });
    expect(s.lives).toBe(1);
  });

  it("次の問題に進むと、また初回は無料。ライフが0でも無料の1回は聞ける", () => {
    let s = run(
      started(),
      { type: "replayWhole", now: 0 },
      { type: "playbackEnded", now: 10 },
      { type: "replaySentence", now: 20 },
      { type: "playbackEnded", now: 30 },
      { type: "replaySentence", now: 40 },
      { type: "playbackEnded", now: 50 },
    );
    expect(s.lives).toBe(0);
    s = run(s, { type: "submit", input: "was", now: 60 }, { type: "next", now: 70 });
    expect(sentenceReplayCost(s)).toBe(0);
    s = run(s, { type: "replaySentence", now: 80 });
    if (s.phase.kind !== "question") throw new Error();
    expect(s.phase.playbackStartedAt).toBe(80);
    expect(s.lives).toBe(0);
  });

  it("聞き直しの再生中は経過時間に数えない", () => {
    let s = started();
    s = run(s, { type: "replaySentence", now: 2000 });
    if (s.phase.kind !== "question") throw new Error();
    expect(activeElapsedMs(s.phase, 5000)).toBe(2000);
    s = run(s, { type: "playbackEnded", now: 7000 });
    if (s.phase.kind !== "question") throw new Error();
    expect(activeElapsedMs(s.phase, 10_000)).toBe(5000);
  });
});

describe("得点とコンボ", () => {
  it("1本を通して、コンボ・スピードボーナス・ヒント・ライフの換算", () => {
    let s = run(
      initQuiz(clip, { combo: 1 }),
      { type: "startQuiz", now: 0, seed: 7 },
      // 問題1：ヒントを使って正解（コンボ2 → ×1.2、ヒントで半分、ボーナスなし）
      { type: "useHint" },
      { type: "submit", input: "was", now: 3000 },
    );
    expect(s.results[0]).toMatchObject({
      verdict: "correct",
      points: 60,
      multiplier: 1.2,
      speedBonus: 0,
      hintUsed: true,
      comboAfter: 2,
    });
    // 問題2：8秒以内に正解（コンボ3 → ×1.5、+20）
    s = run(
      s,
      { type: "next", now: 4000 },
      { type: "submit", input: "park", now: 9000 },
    );
    expect(s.results[1]).toMatchObject({ points: 170, comboAfter: 3 });
    // 問題3：不正解（コンボが切れる）
    s = run(
      s,
      { type: "next", now: 10_000 },
      { type: "replaySentence", now: 10_500 },
      { type: "playbackEnded", now: 12_000 },
      { type: "submit", input: "my with friend", now: 20_000 },
    );
    expect(s.results[2]).toMatchObject({ verdict: "wrong", points: 0, comboAfter: 0 });
    s = run(s, { type: "next", now: 21_000 });
    expect(s.phase.kind).toBe("result");
    expect(s.combo).toBe(0);
    expect(summarize(s)).toEqual({
      total: 3,
      correct: 2,
      close: 0,
      wrong: 1,
      questionPoints: 230,
      lifeBonus: 90,
      points: 320,
      livesLeft: 3,
      maxCombo: 3,
    });
  });

  it("ヒントは穴埋めだけ", () => {
    const s = run(
      started(),
      { type: "submit", input: "was", now: 100 },
      { type: "next", now: 200 },
    );
    expect(run(s, { type: "useHint" })).toBe(s);
  });

  it("再挑戦は得点もライフの換算も半分", () => {
    const s = run(
      initQuiz({ ...clip, items: [clip.items[0]] }, { retry: true }),
      { type: "startQuiz", now: 0, seed: 1 },
      { type: "submit", input: "was", now: 1000 },
      { type: "next", now: 2000 },
    );
    expect(summarize(s)).toMatchObject({ questionPoints: 60, lifeBonus: 45, points: 105 });
  });
});

describe("その段階で受け付けない操作", () => {
  it("無視する", () => {
    const s0 = initQuiz(clip);
    expect(quizReducer(s0, { type: "submit", input: "x", now: 0 })).toBe(s0);
    expect(quizReducer(s0, { type: "next", now: 0 })).toBe(s0);
    expect(quizReducer(s0, { type: "replaySentence", now: 0 })).toBe(s0);
  });
  it("問題がなければすぐ結果", () => {
    const s = quizReducer(initQuiz({ ...clip, items: [] }), {
      type: "startQuiz",
      now: 0,
      seed: 1,
    });
    expect(s.phase.kind).toBe("result");
  });
});
