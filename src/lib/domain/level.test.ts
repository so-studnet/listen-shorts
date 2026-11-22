import { describe, expect, it } from "vitest";
import { levelFromXp, titleFor, xpToNext } from "./level";

describe("level", () => {
  it("必要 XP は 500, 750, 1000, …", () => {
    expect([1, 2, 3].map(xpToNext)).toEqual([500, 750, 1000]);
  });
  it("XP からレベルを出す（境界）", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, title: "見習いリスナー", xpInLevel: 0, xpForNext: 500 });
    expect(levelFromXp(499).level).toBe(1);
    expect(levelFromXp(500)).toMatchObject({ level: 2, xpInLevel: 0, xpForNext: 750 });
    expect(levelFromXp(1250)).toMatchObject({ level: 3, xpInLevel: 0 });
    expect(levelFromXp(-5).level).toBe(1);
  });
  it("Lv10 は約 13,500 XP", () => {
    expect(levelFromXp(13_499).level).toBe(9);
    expect(levelFromXp(13_500).level).toBe(10);
  });
  it("称号はレベルの下限で決まる", () => {
    expect(titleFor(2)).toBe("見習いリスナー");
    expect(titleFor(3)).toBe("耳ならし中");
    expect(titleFor(29)).toBe("字幕いらず");
    expect(titleFor(40)).toBe("ネイティブの耳");
  });
});
