/**
 * 1本のクリップのクイズの進行。画面は useReducer でこの関数を使う。
 * 現在時刻（ミリ秒）と乱数の種は操作に含めて渡す（テストで結果を固定するため）。
 * 仕様は docs/requirements.md の F2〜F4。
 */
import { judgeCloze, normalizeWords, type Verdict } from "./answer";
import { LIVES } from "./constants";
import type { Clip, Item } from "./pack";
import { lifeBonus, scoreAnswer } from "./scoring";
import { seededRandom, shuffle, shuffleNotIdentity } from "./shuffle";
import { tokenize } from "./text";

export type QuestionResult = {
  itemId: string;
  input: string;
  verdict: Verdict;
  points: number;
  multiplier: number;
  speedBonus: number;
  comboAfter: number;
  replays: number;
  elapsedMs: number;
  hintUsed: boolean;
};

export type QuizPhase =
  | { kind: "watching" }
  | {
      kind: "question";
      shownAt: number;
      replays: number;
      hintUsed: boolean;
      /** 聞き直しの再生で止めていた時間の合計 */
      pausedMs: number;
      /** いま聞き直しを再生中なら、その開始時刻 */
      playbackStartedAt: number | null;
    }
  | { kind: "feedback"; result: QuestionResult }
  | { kind: "result" };

export type QuizState = {
  items: Item[];
  index: number;
  phase: QuizPhase;
  results: QuestionResult[];
  lives: number;
  /** いまの連続正解数（クリップをまたいで続く） */
  combo: number;
  /** このクリップの中の最大コンボ */
  maxCombo: number;
  /** 再挑戦（2回目以降）のクリップか */
  retry: boolean;
  /** 聞き分けの選択肢の表示順（itemId ごと） */
  choices: Record<string, string[]>;
  /** 並べ替えのカードの表示順（itemId ごと） */
  cards: Record<string, string[]>;
};

export type QuizAction =
  | { type: "startQuiz"; now: number; seed: number }
  | { type: "replaySentence"; now: number }
  | { type: "replayWhole"; now: number }
  | { type: "playbackEnded"; now: number }
  | { type: "useHint" }
  | { type: "submit"; input: string; now: number }
  | { type: "next"; now: number };

/** 並べ替えのカード（句読点を外した語）。 */
export function orderWords(item: Item): string[] {
  return tokenize(item.answer).map((t) => t.core);
}

export function initQuiz(
  clip: Clip,
  opts: { combo?: number; retry?: boolean } = {},
): QuizState {
  return {
    items: clip.items,
    index: 0,
    phase: { kind: "watching" },
    results: [],
    lives: LIVES.perClip,
    combo: opts.combo ?? 0,
    maxCombo: 0,
    retry: opts.retry ?? false,
    choices: {},
    cards: {},
  };
}

export function judgeItem(item: Item, input: string): Verdict {
  switch (item.type) {
    case "cloze":
      return judgeCloze(input, item.answer, item.accept);
    case "choice":
      return input.trim().toLowerCase() === item.answer.trim().toLowerCase()
        ? "correct"
        : "wrong";
    case "order":
      return normalizeWords(input).join(" ") ===
        normalizeWords(item.answer).join(" ")
        ? "correct"
        : "wrong";
  }
}

function newQuestion(now: number): QuizPhase {
  return {
    kind: "question",
    shownAt: now,
    replays: 0,
    hintUsed: false,
    pausedMs: 0,
    playbackStartedAt: null,
  };
}

/** 聞き直しの再生中を除いた経過時間。 */
export function activeElapsedMs(
  phase: Extract<QuizPhase, { kind: "question" }>,
  now: number,
): number {
  const playing =
    phase.playbackStartedAt === null ? 0 : now - phase.playbackStartedAt;
  return Math.max(0, now - phase.shownAt - phase.pausedMs - playing);
}

function replay(state: QuizState, cost: number, now: number): QuizState {
  const { phase } = state;
  if (phase.kind !== "question" || phase.playbackStartedAt !== null)
    return state;
  if (state.lives < cost) return state;
  return {
    ...state,
    lives: state.lives - cost,
    phase: { ...phase, replays: phase.replays + 1, playbackStartedAt: now },
  };
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  const { phase } = state;
  switch (action.type) {
    case "startQuiz": {
      if (phase.kind !== "watching") return state;
      if (state.items.length === 0)
        return { ...state, phase: { kind: "result" } };
      const rand = seededRandom(action.seed);
      const choices: Record<string, string[]> = {};
      const cards: Record<string, string[]> = {};
      for (const item of state.items) {
        if (item.type === "choice")
          choices[item.itemId] = shuffle(item.options, rand);
        if (item.type === "order")
          cards[item.itemId] = shuffleNotIdentity(orderWords(item), rand, (w) =>
            w.toLowerCase(),
          );
      }
      return {
        ...state,
        index: 0,
        choices,
        cards,
        phase: newQuestion(action.now),
      };
    }

    case "replaySentence":
      return replay(state, LIVES.sentenceReplayCost, action.now);

    case "replayWhole":
      return replay(state, LIVES.fullReplayCost, action.now);

    case "playbackEnded": {
      if (phase.kind !== "question" || phase.playbackStartedAt === null)
        return state;
      return {
        ...state,
        phase: {
          ...phase,
          pausedMs:
            phase.pausedMs + Math.max(0, action.now - phase.playbackStartedAt),
          playbackStartedAt: null,
        },
      };
    }

    case "useHint": {
      if (phase.kind !== "question" || phase.hintUsed) return state;
      if (state.items[state.index].type !== "cloze") return state;
      return { ...state, phase: { ...phase, hintUsed: true } };
    }

    case "submit": {
      if (phase.kind !== "question") return state;
      const item = state.items[state.index];
      const verdict = judgeItem(item, action.input);
      const elapsedMs = activeElapsedMs(phase, action.now);
      const score = scoreAnswer({
        verdict,
        type: item.type,
        comboBefore: state.combo,
        hintUsed: phase.hintUsed,
        elapsedMs,
        retry: state.retry,
      });
      const result: QuestionResult = {
        itemId: item.itemId,
        input: action.input,
        verdict,
        points: score.points,
        multiplier: score.multiplier,
        speedBonus: score.speedBonus,
        comboAfter: score.comboAfter,
        replays: phase.replays,
        elapsedMs,
        hintUsed: phase.hintUsed,
      };
      return {
        ...state,
        combo: score.comboAfter,
        maxCombo: Math.max(state.maxCombo, score.comboAfter),
        phase: { kind: "feedback", result },
        results: [...state.results, result],
      };
    }

    case "next": {
      if (phase.kind !== "feedback") return state;
      const index = state.index + 1;
      if (index >= state.items.length)
        return { ...state, phase: { kind: "result" } };
      return { ...state, index, phase: newQuestion(action.now) };
    }
  }
}

export type QuizSummary = {
  total: number;
  correct: number;
  close: number;
  wrong: number;
  /** 問題の得点の合計 */
  questionPoints: number;
  /** 残りライフの得点 */
  lifeBonus: number;
  /** 合計（= 獲得 XP） */
  points: number;
  livesLeft: number;
  maxCombo: number;
};

export function summarize(state: QuizState): QuizSummary {
  const s = {
    total: state.results.length,
    correct: 0,
    close: 0,
    wrong: 0,
    questionPoints: 0,
  };
  for (const r of state.results) {
    s[r.verdict]++;
    s.questionPoints += r.points;
  }
  const bonus = lifeBonus(state.lives, state.retry);
  return {
    ...s,
    lifeBonus: bonus,
    points: s.questionPoints + bonus,
    livesLeft: state.lives,
    maxCombo: state.maxCombo,
  };
}
