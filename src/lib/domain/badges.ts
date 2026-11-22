/**
 * バッジの定義（データ）と判定。条件は解答記録とクリップの結果から計算する。
 * バッジを足すときは BADGES に1つ足すだけでよい。仕様は docs/requirements.md の F4「バッジ」。
 */
import { LIVES } from "./constants";
import type { AnswerLog, AppData, ClipResult } from "./records";

export type BadgeContext = {
  /** 解答の記録（古い順） */
  answers: AnswerLog[];
  clipResults: ClipResult[];
  /** 1回のクリップの解答（sessionId ごと）。M2 までの記録は sessionId がないので入らない */
  sessions: Map<string, AnswerLog[]>;
  /** クリップ（packId/clipId）→ アクセント */
  accents: Map<string, string>;
};

export type BadgeDef = {
  id: string;
  name: string;
  icon: string;
  /** 条件の説明 */
  description: string;
  /** 達成の度合い [いま, 目標]。1回きりの条件は [0 または 1, 1] */
  progress: (ctx: BadgeContext) => [number, number];
};

const clipKey = (packId: string, clipId: string) => `${packId}/${clipId}`;

/** 条件を満たす連続の最長（pred が false で切れる）。 */
function longestRun<T>(items: readonly T[], pred: (t: T) => boolean): number {
  let best = 0;
  let run = 0;
  for (const t of items) {
    run = pred(t) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const once = (ok: boolean): [number, number] => [ok ? 1 : 0, 1];
const capped = (n: number, goal: number): [number, number] => [Math.min(n, goal), goal];

/** 全問正解のクリップ結果か。 */
const allCorrect = (r: ClipResult) => r.total > 0 && r.correct === r.total;

export const BADGES: readonly BadgeDef[] = [
  {
    id: "first_clear",
    name: "初クリア",
    icon: "🎬",
    description: "クリップを1本最後まで解く",
    progress: (c) => once(c.clipResults.length > 0),
  },
  {
    id: "lr_master",
    name: "L/R マスター",
    icon: "👅",
    description: "L/R の問題に10問連続で正解（惜しいは連続が切れる）",
    progress: (c) =>
      capped(
        longestRun(
          c.answers.filter((a) => a.tags.includes("l_r")),
          (a) => a.verdict === "correct",
        ),
        10,
      ),
  },
  {
    id: "function_hunter",
    name: "機能語ハンター",
    icon: "🎯",
    description: "機能語・弱形の問題に累計50問正解",
    progress: (c) =>
      capped(
        c.answers.filter(
          (a) => a.tags.includes("function_word") && a.verdict === "correct",
        ).length,
        50,
      ),
  },
  {
    id: "no_miss",
    name: "ノーミスクリア",
    icon: "✨",
    description: "1本の中で全問正解（惜しいは不可、ヒントは可）",
    progress: (c) => once(c.clipResults.some(allCorrect)),
  },
  {
    id: "life_saver",
    name: "ライフ温存",
    icon: "❤️",
    description: "1本の中でライフを使わずに全問正解",
    progress: (c) =>
      once(
        c.clipResults.some((r) => allCorrect(r) && r.livesLeft === LIVES.perClip),
      ),
  },
  {
    id: "uk_10",
    name: "イギリス英語 10本",
    icon: "🇬🇧",
    description: "イギリス英語のクリップを10本解く（同じクリップは1本と数える）",
    progress: (c) => {
      const keys = new Set(
        c.clipResults
          .map((r) => clipKey(r.packId, r.clipId))
          .filter((k) => c.accents.get(k) === "UK"),
      );
      return capped(keys.size, 10);
    },
  },
  {
    id: "perfect_combo",
    name: "パーフェクトコンボ",
    icon: "⚡",
    description: "1本の中で全問、ヒントなし・スピードボーナスつきで正解",
    progress: (c) =>
      once(
        [...c.sessions.values()].some(
          (list) =>
            list.length > 0 &&
            c.clipResults.some((r) => r.id === list[0].sessionId) &&
            list.every(
              (a) => a.verdict === "correct" && !a.hintUsed && a.speedBonus > 0,
            ),
        ),
      ),
  },
];

export function buildBadgeContext(data: Pick<AppData, "answers" | "clipResults">): BadgeContext {
  const answers = [...data.answers].sort((a, b) =>
    a.answeredAt.localeCompare(b.answeredAt),
  );
  const sessions = new Map<string, AnswerLog[]>();
  const accents = new Map<string, string>();
  for (const a of answers) {
    accents.set(clipKey(a.packId, a.clipId), a.accent);
    if (!a.sessionId) continue;
    const list = sessions.get(a.sessionId);
    if (list) list.push(a);
    else sessions.set(a.sessionId, [a]);
  }
  return { answers, clipResults: data.clipResults, sessions, accents };
}

/** いま条件を満たしているバッジの ID。 */
export function earnedBadgeIds(ctx: BadgeContext): string[] {
  return BADGES.filter((b) => {
    const [n, goal] = b.progress(ctx);
    return n >= goal;
  }).map((b) => b.id);
}

/** まだ持っていないのに条件を満たしたバッジ。 */
export function newBadges(
  data: Pick<AppData, "answers" | "clipResults" | "progress">,
): BadgeDef[] {
  const have = new Set(data.progress.badges.map((b) => b.id));
  const earned = new Set(earnedBadgeIds(buildBadgeContext(data)));
  return BADGES.filter((b) => earned.has(b.id) && !have.has(b.id));
}
