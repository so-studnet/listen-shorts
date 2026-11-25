/**
 * 途中で閉じたクイズの再開。
 * 解いている途中（問題・判定の画面）の状態を保存できる形にし、開き直したときに戻す。
 * 保存は端末ごと（localStorage）。仕様は docs/requirements.md の F2「途中から再開」。
 */
import { z } from "zod";
import { RESUME_MAX_AGE_DAYS } from "./constants";
import type { Clip } from "./pack";
import {
  orderWords,
  type QuestionResult,
  type QuizPhase,
  type QuizState,
} from "./quiz";

const resultSchema = z.object({
  itemId: z.string(),
  input: z.string(),
  verdict: z.enum(["correct", "close", "wrong"]),
  points: z.number(),
  multiplier: z.number(),
  speedBonus: z.number(),
  comboAfter: z.number(),
  replays: z.number(),
  elapsedMs: z.number(),
  hintUsed: z.boolean(),
});

export const savedQuizSchema = z.object({
  version: z.literal(1),
  /** 誰の途中経過か（ログインしていれば userId、していなければ "local"） */
  owner: z.string(),
  packId: z.string(),
  clipId: z.string(),
  /** 1本のクリップを解いた1回の ID（解答の記録・結果と同じ） */
  sessionId: z.string(),
  source: z.enum(["feed", "retry"]),
  /** クリップを開いたときの XP（レベルアップの判定用） */
  xpAtOpen: z.number(),
  savedAt: z.string(),
  index: z.number().int().min(0),
  results: z.array(resultSchema),
  lives: z.number().int().min(0),
  combo: z.number().int().min(0),
  maxCombo: z.number().int().min(0),
  retry: z.boolean(),
  choices: z.record(z.string(), z.array(z.string())),
  cards: z.record(z.string(), z.array(z.string())),
  /** 問題の画面で閉じたか、判定の画面で閉じたか */
  at: z.enum(["question", "feedback"]),
  /** 問題の画面で閉じたときの、その問題での聞き直しとヒント */
  replays: z.number().int().min(0),
  sentenceReplays: z.number().int().min(0),
  hintUsed: z.boolean(),
});
export type SavedQuiz = z.infer<typeof savedQuizSchema>;

export type SessionInfo = Pick<
  SavedQuiz,
  "owner" | "packId" | "clipId" | "sessionId" | "source" | "xpAtOpen"
>;

/** 保存する値。保存しない段階（視聴中・結果）なら null。 */
export function toSaved(
  state: QuizState,
  info: SessionInfo,
  now: Date,
): SavedQuiz | null {
  const { phase } = state;
  if (phase.kind !== "question" && phase.kind !== "feedback") return null;
  return {
    version: 1,
    ...info,
    savedAt: now.toISOString(),
    index: state.index,
    results: state.results,
    lives: state.lives,
    combo: state.combo,
    maxCombo: state.maxCombo,
    retry: state.retry,
    choices: state.choices,
    cards: state.cards,
    at: phase.kind,
    replays: phase.kind === "question" ? phase.replays : 0,
    sentenceReplays: phase.kind === "question" ? phase.sentenceReplays : 0,
    hintUsed: phase.kind === "question" ? phase.hintUsed : false,
  };
}

/** 保存されていた値を読む。形が合わなければ null。 */
export function parseSaved(raw: unknown): SavedQuiz | null {
  const r = savedQuizSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** まだ使える途中経過か（持ち主が同じで、期限内）。 */
export function isUsable(saved: SavedQuiz, owner: string, now: Date): boolean {
  const age = now.getTime() - new Date(saved.savedAt).getTime();
  return (
    saved.owner === owner &&
    Number.isFinite(age) &&
    age >= 0 &&
    age <= RESUME_MAX_AGE_DAYS * 86_400_000
  );
}

/**
 * 保存されていた途中経過からクイズの状態を戻す。
 * 問題の並びが保存時と合わない（パックを置き換えた・問題が消えた）ときは null。
 * 問題の画面に戻すときは、残り時間をいまから数え直す（聞き直し・ヒントは引き継ぐ）。
 */
export function restoreQuiz(
  saved: SavedQuiz,
  clip: Clip,
  now: number,
): QuizState | null {
  const items = clip.items;
  if (saved.clipId !== clip.clipId) return null;
  if (saved.index >= items.length) return null;
  const expectedResults = saved.at === "feedback" ? saved.index + 1 : saved.index;
  if (saved.results.length !== expectedResults) return null;
  if (saved.results.some((r, i) => r.itemId !== items[i].itemId)) return null;
  // 選択肢・カードが今の問題と合うか（並びは保存時のまま使う）
  const same = (a: readonly string[] | undefined, b: readonly string[]) =>
    !!a && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
  for (const item of items) {
    if (item.type === "choice" && !same(saved.choices[item.itemId], item.options))
      return null;
    if (item.type === "order" && !same(saved.cards[item.itemId], orderWords(item)))
      return null;
  }

  const phase: QuizPhase =
    saved.at === "feedback"
      ? { kind: "feedback", result: saved.results[saved.index] as QuestionResult }
      : {
          kind: "question",
          shownAt: now,
          replays: saved.replays,
          sentenceReplays: saved.sentenceReplays,
          hintUsed: saved.hintUsed,
          pausedMs: 0,
          playbackStartedAt: null,
        };
  return {
    items,
    index: saved.index,
    phase,
    results: saved.results as QuestionResult[],
    lives: saved.lives,
    combo: saved.combo,
    maxCombo: saved.maxCombo,
    retry: saved.retry,
    choices: saved.choices,
    cards: saved.cards,
  };
}
