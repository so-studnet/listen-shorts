/**
 * 保存データの形（docs/architecture.md の AppData）と、壊れたデータの読み込み。
 */
import { z } from "zod";
import { ACCENTS, ITEM_TYPES, TAGS, packSchema } from "./pack";
import { removePackFromQueue, type ReviewEntry } from "./review";

export const answerLogSchema = z.object({
  id: z.string(),
  /** 1本のクリップを解いた1回の ID（clipResults の id と同じ）。M2 までの記録にはない */
  sessionId: z.string().optional(),
  answeredAt: z.string(),
  source: z.enum(["feed", "retry", "review"]),
  packId: z.string(),
  clipId: z.string(),
  itemId: z.string(),
  type: z.enum(ITEM_TYPES),
  tags: z.array(z.enum(TAGS)),
  accent: z.enum(ACCENTS),
  difficulty: z.number(),
  input: z.string(),
  verdict: z.enum(["correct", "close", "wrong"]),
  replays: z.number(),
  elapsedMs: z.number(),
  hintUsed: z.boolean(),
  /** スピードボーナス（M2 までの記録にはないので 0） */
  speedBonus: z.number().default(0),
  points: z.number(),
});
export type AnswerLog = z.infer<typeof answerLogSchema>;

export const clipResultSchema = z.object({
  id: z.string(),
  finishedAt: z.string(),
  packId: z.string(),
  clipId: z.string(),
  source: z.enum(["feed", "retry"]),
  total: z.number(),
  correct: z.number(),
  /** 合計（問題の得点 + ライフの得点） */
  points: z.number(),
  /** 残りライフの得点（M1 の記録にはないので 0） */
  lifeBonus: z.number().default(0),
  livesLeft: z.number(),
  maxCombo: z.number(),
});
export type ClipResult = z.infer<typeof clipResultSchema>;

export const storedPackSchema = z.object({
  importedAt: z.string(),
  pack: packSchema,
});
export type StoredPack = z.infer<typeof storedPackSchema>;

export const progressSchema = z.object({
  /** いまの連続正解数（クリップをまたいで続く） */
  combo: z.number().int().min(0),
  /** 獲得したバッジ（消えない） */
  badges: z
    .array(z.object({ id: z.string(), earnedAt: z.string() }))
    .default([]),
});
export type Progress = z.infer<typeof progressSchema>;

export const feedFilterSchema = z.object({
  packId: z.string().nullable(),
  accent: z.enum(ACCENTS).nullable(),
  difficulty: z.number().int().min(1).max(5).nullable(),
});
export type FeedFilter = z.infer<typeof feedFilterSchema>;
export const NO_FILTER: FeedFilter = { packId: null, accent: null, difficulty: null };

export const reviewEntrySchema: z.ZodType<ReviewEntry> = z.object({
  packId: z.string(),
  clipId: z.string(),
  itemId: z.string(),
  stage: z.number().int().min(0),
  dueAt: z.string(),
  lastAnsweredAt: z.string(),
});

export type AppData = {
  packs: StoredPack[];
  answers: AnswerLog[];
  clipResults: ClipResult[];
  progress: Progress;
  feedFilter: FeedFilter;
  /** 復習キュー */
  review: ReviewEntry[];
};

export const EMPTY_DATA: AppData = Object.freeze({
  packs: [],
  answers: [],
  clipResults: [],
  progress: { combo: 0, badges: [] },
  feedFilter: NO_FILTER,
  review: [],
}) as AppData;

/** 配列の要素を1つずつ検査し、壊れた要素だけ捨てる。 */
function keepValid<T>(schema: z.ZodType<T>, value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const v of value) {
    const r = schema.safeParse(v);
    if (r.success) out.push(r.data);
  }
  return out;
}

/** 保存されていた値（JSON.parse 済み）を AppData にする。壊れた要素は捨てる。 */
export function loadAppData(raw: unknown): AppData {
  if (!raw || typeof raw !== "object") return EMPTY_DATA;
  const r = raw as Record<string, unknown>;
  return {
    packs: keepValid(storedPackSchema, r.packs),
    answers: keepValid(answerLogSchema, r.answers),
    clipResults: keepValid(clipResultSchema, r.clipResults),
    progress: progressSchema.safeParse(r.progress).data ?? {
      combo: 0,
      badges: [],
    },
    feedFilter: feedFilterSchema.safeParse(r.feedFilter).data ?? NO_FILTER,
    review: keepValid(reviewEntrySchema, r.review),
  };
}

/** XP の合計。解答の得点と、クリップの終わりのライフの得点を足す。 */
export function totalXp(data: AppData): number {
  let xp = 0;
  for (const a of data.answers) xp += a.points;
  for (const c of data.clipResults) xp += c.lifeBonus;
  return xp;
}

/**
 * パックを追加する。同じ packId があれば置き換える。元の配列は変えない。
 * 置き換えたとき、新しい版にない問題は復習キューから外す。
 */
export function upsertPack(
  data: AppData,
  pack: StoredPack["pack"],
  importedAt: string,
): AppData {
  const others = data.packs.filter((p) => p.pack.packId !== pack.packId);
  const itemIds = new Set(
    pack.clips.flatMap((c) => c.items.map((i) => i.itemId)),
  );
  return {
    ...data,
    packs: [...others, { importedAt, pack }],
    review: data.review.filter(
      (e) => e.packId !== pack.packId || itemIds.has(e.itemId),
    ),
  };
}

/** 読み込もうとしているパックが、すでにあるパックとどういう関係か。 */
export function packUpdateKind(
  data: Pick<AppData, "packs">,
  pack: { packId: string; version: number },
): { kind: "new" } | { kind: "upgrade" | "sameOrOlder"; oldVersion: number } {
  const old = data.packs.find((p) => p.pack.packId === pack.packId);
  if (!old) return { kind: "new" };
  return {
    kind: pack.version > old.pack.version ? "upgrade" : "sameOrOlder",
    oldVersion: old.pack.version,
  };
}

/** パックを削除する。そのパックの問題は復習キューからも外す（解答の記録は残す）。 */
export function removePack(data: AppData, packId: string): AppData {
  return {
    ...data,
    packs: data.packs.filter((p) => p.pack.packId !== packId),
    review: removePackFromQueue(data.review, packId),
  };
}
