import { describe, expect, it } from "vitest";
import sample from "@/data/sample-pack.json";
import {
  buildCatalog,
  buildFeed,
  playedKeys,
  type FeedFilterInput,
} from "./catalog";
import { validatePack, type Pack } from "./pack";

const s = (validatePack(sample) as { ok: true; pack: Pack }).pack;
const mine: Pack = { ...s, packId: "mine", clips: [s.clips[0]] };
const older: Pack = { ...s, packId: "older", clips: [s.clips[1]] };

describe("buildCatalog", () => {
  it("読み込んだパックの新しい順、最後にサンプル", () => {
    const c = buildCatalog(
      [
        { importedAt: "2026-11-01T00:00:00Z", pack: older },
        { importedAt: "2026-11-02T00:00:00Z", pack: mine },
      ],
      s,
    );
    expect(c.map((e) => e.key)).toEqual([
      "mine/c001",
      "older/c002",
      "sample/c001",
      "sample/c002",
      "sample/c003",
    ]);
  });
  it("サンプルと同じ packId を読み込んだら、そちらを使う", () => {
    const c = buildCatalog(
      [{ importedAt: "t", pack: { ...s, clips: [s.clips[2]] } }],
      s,
    );
    expect(c.map((e) => e.key)).toEqual(["sample/c003"]);
  });
});

describe("buildFeed", () => {
  const catalog = buildCatalog([], s);
  const none: FeedFilterInput = { packId: null, accent: null, difficulty: null };
  it("まだ解いていないクリップを先に", () => {
    expect(
      buildFeed(catalog, none, playedKeys([{ packId: "sample", clipId: "c001" }])).map(
        (e) => e.key,
      ),
    ).toEqual(["sample/c002", "sample/c003", "sample/c001"]);
  });
  it("アクセント・難易度・パックで絞り込む", () => {
    const keys = (f: Partial<FeedFilterInput>) =>
      buildFeed(catalog, { ...none, ...f }, new Set()).map((e) => e.key);
    expect(keys({ accent: "US" })).toEqual(["sample/c002", "sample/c003"]);
    expect(keys({ difficulty: 4 })).toEqual(["sample/c003"]);
    expect(keys({ packId: "other" })).toEqual([]);
    expect(keys({ packId: "sample", accent: "UK" })).toEqual(["sample/c001"]);
  });
});
