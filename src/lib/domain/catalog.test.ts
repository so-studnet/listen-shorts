import { describe, expect, it } from "vitest";
import sample from "@/data/sample-pack.json";
import { buildCatalog } from "./catalog";
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
