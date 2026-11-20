/**
 * 文を語に分け、answer（連続した語）の位置を探す。
 * 穴埋めの空欄の表示と、パックの検証で使う。
 */

export type Token = {
  /** 語の前の記号（引用符など） */
  pre: string;
  /** 語の本体（表示用。アポストロフィやハイフンを含む） */
  core: string;
  /** 語の後ろの記号（句読点など） */
  post: string;
  /** 比べるための形（小文字、アポストロフィを統一） */
  norm: string;
};

const CURLY_APOSTROPHES = /[‘’ʼ`]/g;

/** 語の比較用の形。小文字にし、曲がったアポストロフィを ' にする。 */
export function normToken(core: string): string {
  return core.toLowerCase().replace(CURLY_APOSTROPHES, "'");
}

/** 空白で分け、語の前後の記号を分けておく。記号だけの塊（"-" など）は捨てる。 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const chunk of text.split(/\s+/)) {
    if (!chunk) continue;
    const m = chunk.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
    if (!m || !m[2]) continue;
    tokens.push({ pre: m[1], core: m[2], post: m[3], norm: normToken(m[2]) });
  }
  return tokens;
}

export type Span = { start: number; end: number }; // end は含まない

/**
 * text の中で answer（連続した語）が occurrence 回目に現れる位置を、語の番号で返す。
 * 大文字小文字・前後の句読点・アポストロフィの形の違いは無視する。見つからなければ null。
 */
export function findAnswerSpan(
  text: string,
  answer: string,
  occurrence = 1,
): Span | null {
  const hay = tokenize(text).map((t) => t.norm);
  const needle = tokenize(answer).map((t) => t.norm);
  if (needle.length === 0 || occurrence < 1) return null;
  let seen = 0;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) {
      seen++;
      if (seen === occurrence) return { start: i, end: i + needle.length };
    }
  }
  return null;
}

/** answer の語数。 */
export function wordCount(answer: string): number {
  return tokenize(answer).length;
}

/** ヒント：各語の最初の1文字と、残りを "_" にした形。例 "an absolutely" → "a_ a_________" */
export function hintFor(answer: string): string {
  return tokenize(answer)
    .map((t) => t.core[0] + "_".repeat(Math.max(0, t.core.length - 1)))
    .join(" ");
}
