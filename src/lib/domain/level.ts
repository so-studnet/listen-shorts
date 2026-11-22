/** レベル曲線と称号。仕様は docs/requirements.md の F4「XP とレベル」。 */
import { LEVEL_CURVE, TITLES } from "./constants";

/** レベル n から n+1 に上がるのに必要な XP。 */
export function xpToNext(level: number): number {
  return LEVEL_CURVE.base + LEVEL_CURVE.step * (level - 1);
}

export type LevelInfo = {
  level: number;
  title: string;
  /** このレベルに入ってからの XP */
  xpInLevel: number;
  /** 次のレベルまでに必要な XP（このレベルの幅） */
  xpForNext: number;
};

export function titleFor(level: number): string {
  let title: string = TITLES[0].title;
  for (const t of TITLES) if (level >= t.minLevel) title = t.title;
  return title;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, title: titleFor(level), xpInLevel: rest, xpForNext: xpToNext(level) };
}
