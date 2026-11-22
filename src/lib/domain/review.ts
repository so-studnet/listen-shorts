/**
 * 復習キュー：間違えた問題を、間隔をあけて出し直す。仕様は docs/requirements.md の F5。
 * 日付の区切りは端末の時刻の午前4時（DAY_BOUNDARY_HOUR）。「n日後」は「n日後の区切りの時刻」。
 */
import type { Verdict } from "./answer";
import {
  DAY_BOUNDARY_HOUR,
  HINT_FACTOR,
  POINTS,
  REVIEW_FACTOR,
  REVIEW_INTERVALS_DAYS,
} from "./constants";

export type ReviewEntry = {
  packId: string;
  clipId: string;
  itemId: string;
  /** 段（0〜4）。間隔は REVIEW_INTERVALS_DAYS[stage] 日 */
  stage: number;
  /** 次に出す日時（UTC の ISO 文字列） */
  dueAt: string;
  lastAnsweredAt: string;
};

export type ItemRef = { packId: string; clipId: string; itemId: string };

const sameItem = (a: ItemRef, b: ItemRef) =>
  a.packId === b.packId && a.itemId === b.itemId;

/** その時刻が属する「日」の始まり（端末の時刻で、区切りの時刻）。 */
export function logicalDayStart(now: Date): Date {
  const d = new Date(now);
  if (d.getHours() < DAY_BOUNDARY_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  return d;
}

/** now の属する日から days 日後の区切りの時刻。 */
export function dueAfterDays(now: Date, days: number): Date {
  const d = logicalDayStart(now);
  d.setDate(d.getDate() + days);
  return d;
}

/** 次の段（正解したとき）。null は卒業。 */
export function nextStage(stage: number): number | null {
  const n = stage + 1;
  return n < REVIEW_INTERVALS_DAYS.length ? n : null;
}

function entryAt(ref: ItemRef, stage: number, now: Date): ReviewEntry {
  return {
    packId: ref.packId,
    clipId: ref.clipId,
    itemId: ref.itemId,
    stage,
    dueAt: dueAfterDays(now, REVIEW_INTERVALS_DAYS[stage]).toISOString(),
    lastAnsweredAt: now.toISOString(),
  };
}

/**
 * 解答を復習キューに反映する。元の配列は変えない。
 * - フィードでの解答：不正解・惜しいなら最初の段（1日後）に入れる（入っていれば最初の段に戻す）。正解なら何もしない
 * - 復習での解答：正解なら次の段へ（最後の段なら卒業してキューから外す）。不正解・惜しいなら最初の段に戻す
 */
export function applyAnswer(
  queue: readonly ReviewEntry[],
  ref: ItemRef,
  verdict: Verdict,
  source: "feed" | "retry" | "review",
  now: Date,
): ReviewEntry[] {
  const current = queue.find((e) => sameItem(e, ref));
  const others = queue.filter((e) => !sameItem(e, ref));
  if (verdict !== "correct") return [...others, entryAt(ref, 0, now)];
  if (source !== "review" || !current) return [...queue];
  const stage = nextStage(current.stage);
  return stage === null ? others : [...others, entryAt(ref, stage, now)];
}

/** いま出す問題（期日の古い順）。 */
export function dueEntries(
  queue: readonly ReviewEntry[],
  now: Date,
): ReviewEntry[] {
  const t = now.getTime();
  return queue
    .filter((e) => new Date(e.dueAt).getTime() <= t)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** まだ期日が来ていない問題のうち、いちばん近い日の区切りと件数。 */
export function nextDue(
  queue: readonly ReviewEntry[],
  now: Date,
): { at: Date; count: number } | null {
  const t = now.getTime();
  const later = queue
    .map((e) => new Date(e.dueAt))
    .filter((d) => d.getTime() > t)
    .sort((a, b) => a.getTime() - b.getTime());
  if (later.length === 0) return null;
  const at = later[0];
  return { at, count: later.filter((d) => d.getTime() === at.getTime()).length };
}

/** 復習の得点：基本点 × 復習の係数（ヒントでさらに半分）。コンボ・スピードボーナスはなし。 */
export function reviewPoints(verdict: Verdict, hintUsed: boolean): number {
  return Math.round(
    POINTS[verdict] * REVIEW_FACTOR * (hintUsed ? HINT_FACTOR : 1),
  );
}

/** 指定したパックの問題をキューから外す（パックの削除のとき）。 */
export function removePackFromQueue(
  queue: readonly ReviewEntry[],
  packId: string,
): ReviewEntry[] {
  return queue.filter((e) => e.packId !== packId);
}
