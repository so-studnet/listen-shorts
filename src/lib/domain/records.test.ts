import { describe, expect, it } from "vitest";
import sample from "@/data/sample-pack.json";
import { validatePack, type Pack } from "./pack";
import {
  EMPTY_DATA,
  loadAppData,
  packUpdateKind,
  removePack,
  totalXp,
  upsertPack,
} from "./records";

const pack = (validatePack(sample) as { ok: true; pack: Pack }).pack;

const log = {
  id: "a1",
  answeredAt: "2026-11-20T00:00:00.000Z",
  source: "feed",
  packId: "sample",
  clipId: "c001",
  itemId: "sample-c001-q1",
  type: "cloze",
  tags: ["l_r"],
  accent: "UK",
  difficulty: 2,
  input: "Arizona",
  verdict: "correct",
  replays: 0,
  elapsedMs: 3000,
  hintUsed: false,
  points: 100,
};

describe("loadAppData", () => {
  it("壊れた値なら空", () => {
    expect(loadAppData(null)).toBe(EMPTY_DATA);
    expect(loadAppData("x")).toBe(EMPTY_DATA);
  });
  it("壊れた要素だけ捨てる", () => {
    const d = loadAppData({
      answers: [log, { ...log, verdict: "maybe" }, 3],
      packs: [{ importedAt: "x", pack: sample }, { pack: {} }],
      clipResults: "oops",
    });
    expect(d.answers).toEqual([{ ...log, speedBonus: 0 }]);
    expect(d.packs.length).toBe(1);
    expect(d.clipResults).toEqual([]);
    expect(d.progress).toEqual({ combo: 0, badges: [] });
    expect(d.feedFilter).toEqual({ packId: null, accent: null, difficulty: null });
  });
  it("M1 のクリップ結果（lifeBonus なし）は 0 として読む", () => {
    const d = loadAppData({
      clipResults: [
        { id: "r", finishedAt: "t", packId: "p", clipId: "c", source: "feed", total: 1, correct: 1, points: 100, livesLeft: 0, maxCombo: 0 },
      ],
      progress: { combo: 3 },
    });
    expect(d.clipResults[0].lifeBonus).toBe(0);
    expect(d.progress.combo).toBe(3);
  });
});

describe("totalXp", () => {
  it("解答の得点とライフの得点の合計", () => {
    const d = loadAppData({
      answers: [log, { ...log, id: "a2", points: 50 }],
      clipResults: [
        { id: "r", finishedAt: "t", packId: "p", clipId: "c", source: "feed", total: 2, correct: 1, points: 240, lifeBonus: 90, livesLeft: 3, maxCombo: 1 },
      ],
    });
    expect(totalXp(d)).toBe(240);
  });
});

describe("upsertPack / removePack", () => {
  it("同じ packId は置き換え、元のデータは変えない", () => {
    const a = upsertPack(EMPTY_DATA, pack, "t1");
    const b = upsertPack(a, { ...pack, version: 2 }, "t2");
    expect(EMPTY_DATA.packs).toEqual([]);
    expect(a.packs[0].pack.version).toBe(1);
    expect(b.packs.map((p) => [p.pack.version, p.importedAt])).toEqual([
      [2, "t2"],
    ]);
    expect(removePack(b, "sample").packs).toEqual([]);
  });
  it("パックを消すと、そのパックの復習も外す", () => {
    const entry = { clipId: "c", itemId: "i", stage: 0, dueAt: "t", lastAnsweredAt: "t" };
    const d = loadAppData({
      review: [{ ...entry, packId: "sample" }, { ...entry, packId: "keep" }, { bad: 1 }],
    });
    expect(d.review).toHaveLength(2);
    expect(removePack(d, "sample").review.map((e) => e.packId)).toEqual(["keep"]);
  });
});

describe("パックの置き換え", () => {
  it("新規・新しい版・同じか古い版", () => {
    const d = upsertPack(EMPTY_DATA, pack, "t");
    expect(packUpdateKind(EMPTY_DATA, pack)).toEqual({ kind: "new" });
    expect(packUpdateKind(d, { packId: "sample", version: 2 })).toEqual({ kind: "upgrade", oldVersion: 1 });
    expect(packUpdateKind(d, { packId: "sample", version: 1 })).toEqual({ kind: "sameOrOlder", oldVersion: 1 });
  });
  it("新しい版で消えた問題は復習から外す（ほかのパックはそのまま）", () => {
    const entry = { clipId: "c001", stage: 0, dueAt: "t", lastAnsweredAt: "t" };
    const d = {
      ...upsertPack(EMPTY_DATA, pack, "t"),
      review: [
        { ...entry, packId: "sample", itemId: "sample-c001-q1" },
        { ...entry, packId: "sample", itemId: "sample-c001-q2" },
        { ...entry, packId: "other", itemId: "sample-c001-q2" },
      ],
    };
    const v2 = {
      ...pack,
      version: 2,
      clips: [{ ...pack.clips[0], items: [pack.clips[0].items[0]] }],
    };
    expect(upsertPack(d, v2, "t2").review.map((e) => `${e.packId}/${e.itemId}`)).toEqual([
      "sample/sample-c001-q1",
      "other/sample-c001-q2",
    ]);
  });
});
