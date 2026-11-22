/**
 * 得点・コンボ・スピードボーナス・ライフの換算。仕様は docs/requirements.md の F4。
 */
import type { Verdict } from "./answer";
import {
  COMBO_MULTIPLIERS,
  HINT_FACTOR,
  LIVES,
  POINTS,
  RETRY_FACTOR,
  SPEED_BONUS,
} from "./constants";
import type { ItemType } from "./pack";

/** 連続正解数（この問題を含む）に対する倍率。0 以下なら 1。 */
export function comboMultiplier(streak: number): number {
  if (streak <= 0) return 1;
  return COMBO_MULTIPLIERS[Math.min(streak, COMBO_MULTIPLIERS.length) - 1];
}

/** 解答後のコンボ。正解で +1、惜しいはそのまま、不正解で 0。 */
export function nextCombo(combo: number, verdict: Verdict): number {
  if (verdict === "correct") return combo + 1;
  if (verdict === "close") return combo;
  return 0;
}

export type ScoreInput = {
  verdict: Verdict;
  type: ItemType;
  /** 解答前のコンボ（連続正解数） */
  comboBefore: number;
  hintUsed: boolean;
  /** 表示から解答までの時間（聞き直しの再生中を除く） */
  elapsedMs: number;
  /** 再挑戦（2回目以降）のクリップか */
  retry: boolean;
};

export type Score = {
  points: number;
  base: number;
  multiplier: number;
  speedBonus: number;
  comboAfter: number;
};

export function scoreAnswer(input: ScoreInput): Score {
  const { verdict, type, comboBefore, hintUsed, elapsedMs, retry } = input;
  const comboAfter = nextCombo(comboBefore, verdict);
  const base = POINTS[verdict];
  const multiplier = verdict === "wrong" ? 1 : comboMultiplier(comboAfter);
  const speedBonus =
    verdict === "correct" && !hintUsed && elapsedMs <= SPEED_BONUS.limitMs[type]
      ? SPEED_BONUS.points
      : 0;
  const raw =
    Math.round(base * (hintUsed ? HINT_FACTOR : 1) * multiplier) + speedBonus;
  const points = retry ? Math.round(raw * RETRY_FACTOR) : raw;
  return { points, base, multiplier, speedBonus, comboAfter };
}

/** クリップの終わりの、残りライフの得点。 */
export function lifeBonus(livesLeft: number, retry: boolean): number {
  const raw = Math.max(0, livesLeft) * LIVES.pointsPerRemainingLife;
  return retry ? Math.round(raw * RETRY_FACTOR) : raw;
}
