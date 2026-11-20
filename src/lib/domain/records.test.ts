import { describe, expect, it } from "vitest";
import sample from "@/data/sample-pack.json";
import { validatePack, type Pack } from "./pack";
import { EMPTY_DATA, loadAppData, removePack, upsertPack } from "./records";

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
    expect(d.answers).toEqual([log]);
    expect(d.packs.length).toBe(1);
    expect(d.clipResults).toEqual([]);
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
});
