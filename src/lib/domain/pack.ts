/**
 * クリップパックのスキーマと検証。形式は docs/pack-format.md。
 * エラーの場所は、パス（clips[0].items[1].answer）と、JSON の文字列から読んだときは行番号で示す。
 */
import { z } from "zod";
import { lineForPath, locateJson, type PathSeg } from "./json-locate";
import { findAnswerSpan, tokenize } from "./text";

export const TAGS = [
  "function_word",
  "l_r",
  "final_consonant",
  "linking",
  "vocab",
  "other",
] as const;
export type Tag = (typeof TAGS)[number];

export const ACCENTS = ["US", "UK", "AU", "other"] as const;
export type Accent = (typeof ACCENTS)[number];

export const ITEM_TYPES = ["cloze", "choice", "order"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "英数字・-・_ のみ使えます");
const seconds = z.number().min(0);
const text = z.string().trim().min(1);

const baseItem = {
  itemId: z.string().trim().min(1).max(128),
  sid: z.string().min(1),
  answer: text,
  occurrence: z.number().int().min(1).optional(),
  tags: z.array(z.enum(TAGS)).min(1),
  note: text,
};

const itemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cloze"),
    ...baseItem,
    accept: z.array(text).optional(),
  }),
  z.object({
    type: z.literal("choice"),
    ...baseItem,
    options: z.array(text).min(2).max(4),
  }),
  z.object({ type: z.literal("order"), ...baseItem }),
]);

const sentenceSchema = z.object({
  sid: z.string().min(1),
  start: seconds,
  end: seconds,
  text,
  ja: z.string().optional(),
});

const clipSchema = z.object({
  clipId: id,
  videoId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/, "YouTube の動画 ID（11文字）ではありません"),
  start: seconds,
  end: seconds,
  title: text,
  channel: text,
  accent: z.enum(ACCENTS),
  difficulty: z.number().int().min(1).max(5),
  sentences: z.array(sentenceSchema).min(1),
  items: z.array(itemSchema).min(1).max(8),
});

export const packSchema = z.object({
  schemaVersion: z.literal(1),
  packId: id,
  title: text,
  version: z.number().int().min(1),
  clips: z.array(clipSchema).min(1),
});

export type Pack = z.infer<typeof packSchema>;
export type Clip = Pack["clips"][number];
export type Sentence = Clip["sentences"][number];
export type Item = Clip["items"][number];
export type ClozeItem = Extract<Item, { type: "cloze" }>;

/** 語数の範囲（形式ごと）。 */
const ANSWER_WORDS: Record<ItemType, [number, number]> = {
  cloze: [1, 4],
  choice: [1, 3],
  order: [3, 8],
};

/** クリップの長さ（秒）の範囲。 */
const CLIP_SECONDS: [number, number] = [5, 90];

export type PackIssue = { path: string; message: string; line?: number };

type Lines = ReadonlyMap<string, number> | undefined;

const segs = (path: readonly PropertyKey[]): PathSeg[] =>
  path.filter((p): p is string | number => typeof p !== "symbol");

function issue(path: readonly PropertyKey[], message: string, lines: Lines): PackIssue {
  const line = lines ? lineForPath(lines, segs(path)) : undefined;
  return line === undefined
    ? { path: formatPath(path), message }
    : { path: formatPath(path), message, line };
}

export type PackResult =
  | { ok: true; pack: Pack; warnings: PackIssue[] }
  | { ok: false; errors: PackIssue[] };

/** zod のパス配列を "clips[0].items[1].answer" の形にする。 */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const p of path) {
    if (typeof p === "number") out += `[${p}]`;
    else out += out ? `.${String(p)}` : String(p);
  }
  return out || "(全体)";
}

/** 型の検査を通ったパックの、項目どうしの関係を確かめる。 */
function checkRelations(
  pack: Pack,
  otherItemIds: ReadonlySet<string>,
  lines: Lines,
) {
  const errors: PackIssue[] = [];
  const warnings: PackIssue[] = [];
  const err = (path: PropertyKey[], message: string) =>
    errors.push(issue(path, message, lines));

  const clipIds = new Set<string>();
  const itemIds = new Set<string>();
  pack.clips.forEach((clip, ci) => {
    const cp = ["clips", ci];
    if (clipIds.has(clip.clipId))
      err([...cp, "clipId"], `clipId "${clip.clipId}" が重複しています`);
    clipIds.add(clip.clipId);

    const len = clip.end - clip.start;
    if (len < CLIP_SECONDS[0] || len > CLIP_SECONDS[1])
      err(
        [...cp, "end"],
        `クリップの長さは ${CLIP_SECONDS[0]}〜${CLIP_SECONDS[1]} 秒にしてください（いまは ${len.toFixed(1)} 秒）`,
      );

    const sentences = new Map<string, Sentence>();
    clip.sentences.forEach((s, si) => {
      const sp = [...cp, "sentences", si];
      if (sentences.has(s.sid))
        err([...sp, "sid"], `sid "${s.sid}" が重複しています`);
      sentences.set(s.sid, s);
      if (s.start >= s.end)
        err([...sp, "end"], "end は start より後にしてください");
      if (s.start < clip.start || s.end > clip.end)
        err(
          [...sp, "start"],
          `文の区間（${s.start}〜${s.end}）がクリップの区間（${clip.start}〜${clip.end}）からはみ出しています`,
        );
    });

    clip.items.forEach((item, ii) => {
      const ip = [...cp, "items", ii];
      if (itemIds.has(item.itemId))
        err([...ip, "itemId"], `itemId "${item.itemId}" が重複しています`);
      itemIds.add(item.itemId);
      if (otherItemIds.has(item.itemId))
        warnings.push(
          issue(
            [...ip, "itemId"],
            `itemId "${item.itemId}" はほかのパックにもあります`,
            lines,
          ),
        );

      const s = sentences.get(item.sid);
      if (!s) {
        err([...ip, "sid"], `sid "${item.sid}" の文がこのクリップにありません`);
        return;
      }

      const words = tokenize(item.answer);
      const [min, max] = ANSWER_WORDS[item.type];
      if (words.length < min || words.length > max)
        err(
          [...ip, "answer"],
          `${item.type} の answer は ${min}〜${max} 語にしてください（いまは ${words.length} 語）`,
        );

      if (!findAnswerSpan(s.text, item.answer, item.occurrence ?? 1)) {
        const which = item.occurrence ? `${item.occurrence} 回目の ` : "";
        err(
          [...ip, "answer"],
          `文の中に${which}"${item.answer}" が見つかりません`,
        );
      }

      if (item.type === "choice") {
        const norm = item.options.map((o) => o.trim().toLowerCase());
        if (new Set(norm).size !== norm.length)
          err([...ip, "options"], "options に同じものがあります");
        if (!norm.includes(item.answer.trim().toLowerCase()))
          err([...ip, "options"], "options に answer が入っていません");
      }

      if (item.type === "order") {
        const norms = words.map((w) => w.norm);
        if (new Set(norms).size < 2)
          err(
            [...ip, "answer"],
            "並べ替えても順序が変わらないので、order にできません",
          );
      }
    });
  });
  return { errors, warnings };
}

/**
 * パックの値（JSON.parse 済み）を検証する。
 * otherItemIds：すでに読み込んであるほかのパックの itemId（重複の警告に使う）。
 * lines：JSON の文字列から読んだときの、パス → 行番号（エラーに行番号を付ける）。
 */
export function validatePack(
  value: unknown,
  otherItemIds: ReadonlySet<string> = new Set(),
  lines?: ReadonlyMap<string, number>,
): PackResult {
  const parsed = packSchema.safeParse(value, {
    error: z.locales.ja().localeError,
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => issue(i.path, i.message, lines)),
    };
  }
  const { errors, warnings } = checkRelations(parsed.data, otherItemIds, lines);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, pack: parsed.data, warnings };
}

/** JSON の文字列からパックを読む。書き方の誤りも中身の誤りも、行番号を付けて返す。 */
export function parsePackJson(
  json: string,
  otherItemIds?: ReadonlySet<string>,
): PackResult {
  const located = locateJson(json);
  if (!located.ok) {
    return {
      ok: false,
      errors: [
        {
          path: "(JSON の書き方)",
          message: `${located.message}（${located.column}文字目）`,
          line: located.line,
        },
      ],
    };
  }
  return validatePack(located.value, otherItemIds, located.lines);
}
