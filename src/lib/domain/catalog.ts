/**
 * 出題できるクリップの一覧。読み込んだパック（新しい順）のあとにサンプルパックを置く。
 * M3 で「まだ解いていないクリップを先に」と絞り込みを足す。
 */
import type { Clip, Pack, Sentence } from "./pack";
import type { StoredPack } from "./records";

export type CatalogEntry = { pack: Pack; clip: Clip; key: string };

export function buildCatalog(
  stored: readonly StoredPack[],
  sample: Pack,
): CatalogEntry[] {
  const packs = [...stored]
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .map((s) => s.pack);
  if (!packs.some((p) => p.packId === sample.packId)) packs.push(sample);
  return packs.flatMap((pack) =>
    pack.clips.map((clip) => ({
      pack,
      clip,
      key: `${pack.packId}/${clip.clipId}`,
    })),
  );
}

export function sentenceOf(clip: Clip, sid: string): Sentence {
  const s = clip.sentences.find((x) => x.sid === sid);
  if (!s) throw new Error(`sid ${sid} がありません`);
  return s;
}

export type FeedFilterInput = {
  packId: string | null;
  accent: string | null;
  difficulty: number | null;
};

/** 解いたことのあるクリップの key（packId/clipId）。 */
export function playedKeys(
  clipResults: readonly { packId: string; clipId: string }[],
): Set<string> {
  return new Set(clipResults.map((r) => `${r.packId}/${r.clipId}`));
}

/**
 * フィードの並び：絞り込んだうえで、まだ解いていないクリップ → 解いたクリップ。
 * それぞれの中ではカタログの順（新しいパックから、パック内は順番どおり）。
 */
export function buildFeed(
  catalog: readonly CatalogEntry[],
  filter: FeedFilterInput,
  played: ReadonlySet<string>,
): CatalogEntry[] {
  const hit = catalog.filter(
    (e) =>
      (filter.packId === null || e.pack.packId === filter.packId) &&
      (filter.accent === null || e.clip.accent === filter.accent) &&
      (filter.difficulty === null || e.clip.difficulty === filter.difficulty),
  );
  return [
    ...hit.filter((e) => !played.has(e.key)),
    ...hit.filter((e) => played.has(e.key)),
  ];
}
