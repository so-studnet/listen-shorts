/**
 * アプリのデータ（AppData）と Supabase の行の相互変換と、差分の計算。
 * user_id はストアが付ける（主キーが user_id + id のため）。
 */
import type { Pack } from "@/lib/domain/pack";
import {
  EMPTY_DATA,
  NO_FILTER,
  loadAppData,
  type AnswerLog,
  type AppData,
  type ClipResult,
  type FeedFilter,
  type Progress,
  type StoredPack,
} from "@/lib/domain/records";
import type { ReviewEntry } from "@/lib/domain/review";

export type PackRow = { id: string; data: Pack; imported_at: string };
export type AnswerRow = {
  id: string;
  session_id: string | null;
  answered_at: string;
  source: AnswerLog["source"];
  pack_id: string;
  clip_id: string;
  item_id: string;
  type: AnswerLog["type"];
  tags: string[];
  accent: AnswerLog["accent"];
  difficulty: number;
  input: string;
  verdict: AnswerLog["verdict"];
  replays: number;
  elapsed_ms: number;
  hint_used: boolean;
  speed_bonus: number;
  points: number;
};
export type ClipResultRow = {
  id: string;
  finished_at: string;
  pack_id: string;
  clip_id: string;
  source: ClipResult["source"];
  total: number;
  correct: number;
  points: number;
  life_bonus: number;
  lives_left: number;
  max_combo: number;
};
export type ReviewRow = {
  id: string;
  pack_id: string;
  clip_id: string;
  item_id: string;
  stage: number;
  due_at: string;
  last_answered_at: string;
};
export type ProgressRow = {
  combo: number;
  badges: Progress["badges"];
  feed_filter: FeedFilter;
};

/** DB は "+00:00" の形で返すので、アプリの形（toISOString）にそろえる。 */
const iso = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
};

export const packToRow = (p: StoredPack): PackRow => ({
  id: p.pack.packId,
  data: p.pack,
  imported_at: p.importedAt,
});

export const answerToRow = (a: AnswerLog): AnswerRow => ({
  id: a.id,
  session_id: a.sessionId ?? null,
  answered_at: a.answeredAt,
  source: a.source,
  pack_id: a.packId,
  clip_id: a.clipId,
  item_id: a.itemId,
  type: a.type,
  tags: a.tags,
  accent: a.accent,
  difficulty: a.difficulty,
  input: a.input,
  verdict: a.verdict,
  replays: a.replays,
  elapsed_ms: Math.max(0, Math.round(a.elapsedMs)),
  hint_used: a.hintUsed,
  speed_bonus: a.speedBonus,
  points: a.points,
});

export const clipResultToRow = (c: ClipResult): ClipResultRow => ({
  id: c.id,
  finished_at: c.finishedAt,
  pack_id: c.packId,
  clip_id: c.clipId,
  source: c.source,
  total: c.total,
  correct: c.correct,
  points: c.points,
  life_bonus: c.lifeBonus,
  lives_left: c.livesLeft,
  max_combo: c.maxCombo,
});

export const reviewKey = (e: { packId: string; itemId: string }) =>
  `${e.packId}/${e.itemId}`;

export const reviewToRow = (e: ReviewEntry): ReviewRow => ({
  id: reviewKey(e),
  pack_id: e.packId,
  clip_id: e.clipId,
  item_id: e.itemId,
  stage: e.stage,
  due_at: e.dueAt,
  last_answered_at: e.lastAnsweredAt,
});

export const progressToRow = (d: Pick<AppData, "progress" | "feedFilter">): ProgressRow => ({
  combo: d.progress.combo,
  badges: d.progress.badges,
  feed_filter: d.feedFilter,
});

export type Rows = {
  packs: PackRow[];
  answers: AnswerRow[];
  clipResults: ClipResultRow[];
  review: ReviewRow[];
  progress: ProgressRow | null;
};

/** DB の行からアプリのデータを作る。形の合わない行は捨てる（loadAppData と同じ検査を通す）。 */
export function rowsToAppData(rows: Rows): AppData {
  return loadAppData({
    packs: rows.packs.map((r) => ({ importedAt: iso(r.imported_at), pack: r.data })),
    answers: rows.answers.map((r) => ({
      id: r.id,
      ...(r.session_id ? { sessionId: r.session_id } : {}),
      answeredAt: iso(r.answered_at),
      source: r.source,
      packId: r.pack_id,
      clipId: r.clip_id,
      itemId: r.item_id,
      type: r.type,
      tags: r.tags ?? [],
      accent: r.accent,
      difficulty: r.difficulty,
      input: r.input,
      verdict: r.verdict,
      replays: r.replays,
      elapsedMs: r.elapsed_ms,
      hintUsed: r.hint_used,
      speedBonus: r.speed_bonus,
      points: r.points,
    })),
    clipResults: rows.clipResults.map((r) => ({
      id: r.id,
      finishedAt: iso(r.finished_at),
      packId: r.pack_id,
      clipId: r.clip_id,
      source: r.source,
      total: r.total,
      correct: r.correct,
      points: r.points,
      lifeBonus: r.life_bonus,
      livesLeft: r.lives_left,
      maxCombo: r.max_combo,
    })),
    review: rows.review.map((r) => ({
      packId: r.pack_id,
      clipId: r.clip_id,
      itemId: r.item_id,
      stage: r.stage,
      dueAt: iso(r.due_at),
      lastAnsweredAt: iso(r.last_answered_at),
    })),
    progress: rows.progress
      ? { combo: rows.progress.combo, badges: rows.progress.badges ?? [] }
      : undefined,
    feedFilter: rows.progress?.feed_filter ?? NO_FILTER,
  });
}

export type RowDiff<R> = { upserts: R[]; deletes: string[] };

/**
 * id ごとに比べ、追加・変更された行と削除された id を返す。
 * immutable なら中身は比べない（解答の記録のように、一度書いたら変えないもの。数が多いので速くする）。
 */
export function diffRows<T, R extends { id: string }>(
  prev: readonly T[],
  next: readonly T[],
  toRow: (t: T) => R,
  opts: { immutable?: boolean } = {},
): RowDiff<R> {
  if (prev === next) return { upserts: [], deletes: [] };
  const nextRows = next.map(toRow);
  const after = new Set(nextRows.map((r) => r.id));
  if (opts.immutable) {
    const before = new Set(prev.map((t) => toRow(t).id));
    return {
      upserts: nextRows.filter((r) => !before.has(r.id)),
      deletes: [...before].filter((id) => !after.has(id)),
    };
  }
  const before = new Map(prev.map((t) => {
    const r = toRow(t);
    return [r.id, JSON.stringify(r)];
  }));
  return {
    upserts: nextRows.filter((r) => before.get(r.id) !== JSON.stringify(r)),
    deletes: [...before.keys()].filter((id) => !after.has(id)),
  };
}

export type AppDataDiff = {
  packs: RowDiff<PackRow>;
  answers: RowDiff<AnswerRow>;
  clipResults: RowDiff<ClipResultRow>;
  review: RowDiff<ReviewRow>;
  /** 変わったときだけ */
  progress: ProgressRow | null;
};

export function diffAppData(prev: AppData, next: AppData): AppDataDiff {
  const p0 = JSON.stringify(progressToRow(prev));
  const p1 = progressToRow(next);
  return {
    packs: diffRows(prev.packs, next.packs, packToRow),
    answers: diffRows(prev.answers, next.answers, answerToRow, { immutable: true }),
    clipResults: diffRows(prev.clipResults, next.clipResults, clipResultToRow, { immutable: true }),
    review: diffRows(prev.review, next.review, reviewToRow),
    progress: JSON.stringify(p1) === p0 ? null : p1,
  };
}

export function isEmptyDiff(d: AppDataDiff): boolean {
  return (
    d.progress === null &&
    [d.packs, d.answers, d.clipResults, d.review].every(
      (x) => x.upserts.length === 0 && x.deletes.length === 0,
    )
  );
}

/** 取り込む価値のあるデータがあるか（パック・解答・結果・復習のどれか）。 */
export function hasLocalData(d: AppData): boolean {
  return (
    d.packs.length + d.answers.length + d.clipResults.length + d.review.length > 0
  );
}

/**
 * このブラウザのデータを、サーバーのデータに取り込む。
 * 同じ id はサーバー側を優先する。バッジは合わせる。コンボと絞り込みはサーバー側。
 */
export function mergeAppData(server: AppData, local: AppData): AppData {
  const add = <T>(base: readonly T[], extra: readonly T[], key: (t: T) => string) => {
    const ids = new Set(base.map(key));
    return [...base, ...extra.filter((x) => !ids.has(key(x)))];
  };
  return {
    packs: add(server.packs, local.packs, (p) => p.pack.packId),
    answers: add(server.answers, local.answers, (a) => a.id),
    clipResults: add(server.clipResults, local.clipResults, (c) => c.id),
    review: add(server.review, local.review, reviewKey),
    progress: {
      combo: server.progress.combo,
      badges: add(server.progress.badges, local.progress.badges, (b) => b.id),
    },
    feedFilter: server.feedFilter,
  };
}

export { EMPTY_DATA };
