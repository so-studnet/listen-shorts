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
