/**
 * 保存データの形（docs/architecture.md の AppData）と、壊れたデータの読み込み。
 */
import { z } from "zod";
import { ACCENTS, ITEM_TYPES, TAGS, packSchema } from "./pack";

export const answerLogSchema = z.object({
  id: z.string(),
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
  points: z.number(),
  livesLeft: z.number(),
  maxCombo: z.number(),
});
export type ClipResult = z.infer<typeof clipResultSchema>;

export const storedPackSchema = z.object({
  importedAt: z.string(),
  pack: packSchema,
});
export type StoredPack = z.infer<typeof storedPackSchema>;

export type AppData = {
  packs: StoredPack[];
  answers: AnswerLog[];
  clipResults: ClipResult[];
};

export const EMPTY_DATA: AppData = Object.freeze({
  packs: [],
  answers: [],
  clipResults: [],
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
  };
}

/** パックを追加する。同じ packId があれば置き換える。元の配列は変えない。 */
export function upsertPack(
  data: AppData,
  pack: StoredPack["pack"],
  importedAt: string,
): AppData {
  const others = data.packs.filter((p) => p.pack.packId !== pack.packId);
  return { ...data, packs: [...others, { importedAt, pack }] };
}

export function removePack(data: AppData, packId: string): AppData {
  return {
    ...data,
    packs: data.packs.filter((p) => p.pack.packId !== packId),
  };
}
