/**
 * ゲームの数値。調整するときはここだけを直す。
 * 意味は docs/requirements.md の F3〜F5。
 */

/** 「惜しい」と認める語の最小の長さ（正解側の語の文字数）。 */
export const CLOSE_MIN_WORD_LENGTH = 5;

export const POINTS = {
  correct: 100,
  close: 50,
  wrong: 0,
} as const;

/** 連続正解数（この問題を含む）→ 倍率。最後の値が上限。index 0 は連続1問目。 */
export const COMBO_MULTIPLIERS = [1.0, 1.2, 1.5, 2.0] as const;

/** スピードボーナス：問題の表示から制限時間内に正解（ヒントなし）で加点。 */
export const SPEED_BONUS = {
  points: 20,
  limitMs: { cloze: 15_000, order: 15_000, choice: 8_000 },
} as const;

export const LIVES = {
  perClip: 3,
  /** 各問題で、文の聞き直しを無料でできる回数（それ以降は sentenceReplayCost） */
  freeSentenceReplays: 1,
  sentenceReplayCost: 1,
  fullReplayCost: 2,
  pointsPerRemainingLife: 30,
} as const;

/** ヒントを使ったときの得点の係数。 */
export const HINT_FACTOR = 0.5;

/** 再挑戦（2回目以降）のクリップの得点の係数。 */
export const RETRY_FACTOR = 0.5;

/** 復習の得点の係数（基本点にかける）。 */
export const REVIEW_FACTOR = 0.5;

/** レベル n → n+1 に必要な XP は base + step × (n − 1)。 */
export const LEVEL_CURVE = { base: 500, step: 250 } as const;

/** 称号。レベルの下限の昇順。 */
export const TITLES = [
  { minLevel: 1, title: "見習いリスナー" },
  { minLevel: 3, title: "耳ならし中" },
  { minLevel: 5, title: "弱形に気づく人" },
  { minLevel: 8, title: "聞き分け職人" },
  { minLevel: 12, title: "連結ほどき" },
  { minLevel: 16, title: "速い会話の追跡者" },
  { minLevel: 20, title: "字幕いらず" },
  { minLevel: 30, title: "ネイティブの耳" },
] as const;

/** 復習の間隔（日）。最後の段で正解したら卒業。 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

/** 日付の区切りの時刻（端末の時刻で、この時から新しい日）。 */
export const DAY_BOUNDARY_HOUR = 4;

/** 区間再生の終わりに足す余白（秒）。 */
export const PLAYBACK_TAIL_PADDING = 0.3;
