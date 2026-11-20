/**
 * 1本のクリップのクイズの進行。画面は useReducer でこの関数を使う。
 * 現在時刻（ミリ秒）は操作に含めて渡す。
 * M1：穴埋めのみ・基本点のみ。ライフ・コンボ・ヒント・スピードボーナスは M2。
 */
import { judgeCloze, type Verdict } from "./answer";
import { POINTS } from "./constants";
import type { Clip, Item, ItemType } from "./pack";

/** この版で出題できる形式。 */
export const SUPPORTED_TYPES: readonly ItemType[] = ["cloze"];

export type QuestionResult = {
  itemId: string;
  input: string;
  verdict: Verdict;
  points: number;
  replays: number;
  elapsedMs: number;
};

export type QuizPhase =
  | { kind: "watching" }
  | { kind: "question"; shownAt: number; replays: number }
  | { kind: "feedback"; result: QuestionResult }
  | { kind: "result" };

export type QuizState = {
  items: Item[];
  index: number;
  phase: QuizPhase;
  results: QuestionResult[];
};

export type QuizAction =
  | { type: "startQuiz"; now: number }
  | { type: "replaySentence" }
  | { type: "submit"; input: string; now: number }
  | { type: "next"; now: number };

export function playableItems(clip: Clip): Item[] {
  return clip.items.filter((i) => SUPPORTED_TYPES.includes(i.type));
}

export function initQuiz(clip: Clip): QuizState {
  return {
    items: playableItems(clip),
    index: 0,
    phase: { kind: "watching" },
    results: [],
  };
}

export function judgeItem(item: Item, input: string): Verdict {
  switch (item.type) {
    case "cloze":
      return judgeCloze(input, item.answer, item.accept);
    default:
      return input.trim().toLowerCase() === item.answer.trim().toLowerCase()
        ? "correct"
        : "wrong";
  }
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  const { phase } = state;
  switch (action.type) {
    case "startQuiz":
      if (phase.kind !== "watching") return state;
      if (state.items.length === 0)
        return { ...state, phase: { kind: "result" } };
      return {
        ...state,
        index: 0,
        phase: { kind: "question", shownAt: action.now, replays: 0 },
      };

    case "replaySentence":
      if (phase.kind !== "question") return state;
      return { ...state, phase: { ...phase, replays: phase.replays + 1 } };

    case "submit": {
      if (phase.kind !== "question") return state;
      const item = state.items[state.index];
      const verdict = judgeItem(item, action.input);
      const result: QuestionResult = {
        itemId: item.itemId,
        input: action.input,
        verdict,
        points: POINTS[verdict],
        replays: phase.replays,
        elapsedMs: Math.max(0, action.now - phase.shownAt),
      };
      return {
        ...state,
        phase: { kind: "feedback", result },
        results: [...state.results, result],
      };
    }

    case "next": {
      if (phase.kind !== "feedback") return state;
      const index = state.index + 1;
      if (index >= state.items.length)
        return { ...state, phase: { kind: "result" } };
      return {
        ...state,
        index,
        phase: { kind: "question", shownAt: action.now, replays: 0 },
      };
    }
  }
}

export type QuizSummary = {
  total: number;
  correct: number;
  close: number;
  wrong: number;
  points: number;
};

export function summarize(results: readonly QuestionResult[]): QuizSummary {
  const s: QuizSummary = {
    total: results.length,
    correct: 0,
    close: 0,
    wrong: 0,
    points: 0,
  };
  for (const r of results) {
    s[r.verdict]++;
    s.points += r.points;
  }
  return s;
}
