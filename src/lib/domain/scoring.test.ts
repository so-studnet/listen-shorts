import { describe, expect, it } from "vitest";
import { comboMultiplier, lifeBonus, nextCombo, scoreAnswer } from "./scoring";

const base = {
  type: "cloze" as const,
  comboBefore: 0,
  hintUsed: false,
  elapsedMs: 60_000,
  retry: false,
};

describe("comboMultiplier / nextCombo", () => {
  it("1→1.0、2→1.2、3→1.5、4以上→2.0", () => {
    expect([0, 1, 2, 3, 4, 10].map(comboMultiplier)).toEqual([
      1, 1, 1.2, 1.5, 2, 2,
    ]);
  });
  it("正解で+1、惜しいはそのまま、不正解で0", () => {
    expect(nextCombo(2, "correct")).toBe(3);
    expect(nextCombo(2, "close")).toBe(2);
    expect(nextCombo(2, "wrong")).toBe(0);
  });
});

describe("scoreAnswer", () => {
  it("正解：100 × 倍率", () => {
    expect(scoreAnswer({ ...base, verdict: "correct" })).toMatchObject({
      points: 100,
      multiplier: 1,
      comboAfter: 1,
    });
    expect(
      scoreAnswer({ ...base, verdict: "correct", comboBefore: 2 }),
    ).toMatchObject({ points: 150, multiplier: 1.5, comboAfter: 3 });
  });
  it("惜しい：50 × いまの倍率、コンボは増えない", () => {
    expect(
      scoreAnswer({ ...base, verdict: "close", comboBefore: 2 }),
    ).toMatchObject({ points: 60, multiplier: 1.2, comboAfter: 2 });
    expect(scoreAnswer({ ...base, verdict: "close" }).points).toBe(50);
  });
  it("不正解：0点、コンボは0", () => {
    expect(
      scoreAnswer({ ...base, verdict: "wrong", comboBefore: 5 }),
    ).toMatchObject({ points: 0, comboAfter: 0 });
  });
  it("スピードボーナス：形式ごとの制限時間内の正解で +20（倍率はかけない）", () => {
    const fast = { ...base, verdict: "correct" as const, comboBefore: 3 };
    expect(scoreAnswer({ ...fast, elapsedMs: 15_000 }).points).toBe(220);
    expect(scoreAnswer({ ...fast, elapsedMs: 15_001 }).points).toBe(200);
    expect(scoreAnswer({ ...fast, type: "choice", elapsedMs: 8_000 }).speedBonus).toBe(20);
    expect(scoreAnswer({ ...fast, type: "choice", elapsedMs: 9_000 }).speedBonus).toBe(0);
    expect(scoreAnswer({ ...base, verdict: "close", elapsedMs: 0 }).speedBonus).toBe(0);
  });
  it("ヒント：得点が半分、スピードボーナスなし", () => {
    expect(
      scoreAnswer({ ...base, verdict: "correct", hintUsed: true, elapsedMs: 0 }),
    ).toMatchObject({ points: 50, speedBonus: 0 });
  });
  it("再挑戦：全体が半分", () => {
    expect(
      scoreAnswer({ ...base, verdict: "correct", elapsedMs: 0, retry: true }).points,
    ).toBe(60);
  });
});

describe("lifeBonus", () => {
  it("1つ30点、再挑戦は半分", () => {
    expect(lifeBonus(3, false)).toBe(90);
    expect(lifeBonus(3, true)).toBe(45);
    expect(lifeBonus(-1, false)).toBe(0);
  });
});
