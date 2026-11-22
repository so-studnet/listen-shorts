/**
 * 記録の画面の集計。すべて解答の記録（answers）から計算する。仕様は docs/requirements.md の F6「記録」。
 * - 正答率 = 正解 ÷ 解答数。惜しいは正答率に入れず、別に数える
 * - 週は月曜始まり。日付の区切りは午前4時（review.ts と同じ）
 * - フィード・再挑戦・復習のすべての解答を数える
 */
import { logicalDayStart } from "./review";
import { ACCENTS, TAGS, type Accent, type Tag } from "./pack";
import type { AnswerLog } from "./records";

export type Tally = { total: number; correct: number; close: number };

/** 正答率（0〜1）。解答がなければ null。 */
export function rate(t: Tally): number | null {
  return t.total === 0 ? null : t.correct / t.total;
}

function tally(list: readonly AnswerLog[]): Tally {
  const t: Tally = { total: 0, correct: 0, close: 0 };
  for (const a of list) {
    t.total++;
    if (a.verdict === "correct") t.correct++;
    else if (a.verdict === "close") t.close++;
  }
  return t;
}

/** その時刻が属する週の始まり（月曜の区切りの時刻）。 */
export function weekStart(at: Date): Date {
  const d = logicalDayStart(at);
  const back = (d.getDay() + 6) % 7; // 月曜=0
  d.setDate(d.getDate() - back);
  return d;
}

export type WeekTally = Tally & { start: Date };

/** 直近 weeks 週（古い順）の集計。filter で数える解答を絞れる。 */
export function weekly(
  answers: readonly AnswerLog[],
  now: Date,
  weeks: number,
  filter: (a: AnswerLog) => boolean = () => true,
): WeekTally[] {
  const starts: Date[] = [];
  const first = weekStart(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(first);
    d.setDate(d.getDate() - 7 * i);
    starts.push(d);
  }
  const buckets = starts.map((start) => ({ start, list: [] as AnswerLog[] }));
  const index = new Map(starts.map((s, i) => [s.getTime(), i]));
  for (const a of answers) {
    if (!filter(a)) continue;
    const i = index.get(weekStart(new Date(a.answeredAt)).getTime());
    if (i !== undefined) buckets[i].list.push(a);
  }
  return buckets.map((b) => ({ start: b.start, ...tally(b.list) }));
}

/** タグごとの、全期間の集計と直近 weeks 週の推移。 */
export function byTag(
  answers: readonly AnswerLog[],
  now: Date,
  weeks: number,
): { tag: Tag; all: Tally; weeks: WeekTally[] }[] {
  return TAGS.map((tag) => {
    const has = (a: AnswerLog) => a.tags.includes(tag);
    return {
      tag,
      all: tally(answers.filter(has)),
      weeks: weekly(answers, now, weeks, has),
    };
  });
}

/** アクセントごとの全期間の集計。 */
export function byAccent(
  answers: readonly AnswerLog[],
): { accent: Accent; all: Tally }[] {
  return ACCENTS.map((accent) => ({
    accent,
    all: tally(answers.filter((a) => a.accent === accent)),
  }));
}

/** 全期間の集計。 */
export function overall(answers: readonly AnswerLog[]): Tally {
  return tally(answers);
}

export const TAG_LABEL: Record<Tag, string> = {
  function_word: "機能語・弱形",
  l_r: "L と R",
  final_consonant: "語末子音",
  linking: "連結",
  vocab: "知らない単語",
  other: "その他",
};
