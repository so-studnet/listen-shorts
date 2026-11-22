import { describe, expect, it } from "vitest";
import { seededRandom, shuffle, shuffleNotIdentity } from "./shuffle";

describe("shuffle", () => {
  it("同じ種なら同じ結果、要素は変わらない", () => {
    const a = shuffle([1, 2, 3, 4, 5], seededRandom(42));
    const b = shuffle([1, 2, 3, 4, 5], seededRandom(42));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("元の配列は変えない", () => {
    const src = [1, 2, 3];
    shuffle(src, seededRandom(1));
    expect(src).toEqual([1, 2, 3]);
  });
});

describe("shuffleNotIdentity", () => {
  it("どの種でも元の並びにならない", () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(shuffleNotIdentity(["a", "b"], seededRandom(seed))).toEqual([
        "b",
        "a",
      ]);
      expect(
        shuffleNotIdentity(["to", "get", "one", "of", "these"], seededRandom(seed)).join(" "),
      ).not.toBe("to get one of these");
    }
  });
  it("同じ語が含まれていても、語の並びとして変わる", () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(
        shuffleNotIdentity(["that", "that", "is"], seededRandom(seed)).join(" "),
      ).not.toBe("that that is");
    }
  });
  it("すべて同じなら元のまま", () => {
    expect(shuffleNotIdentity(["a", "a"], seededRandom(1))).toEqual(["a", "a"]);
  });
});
