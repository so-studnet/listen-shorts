/**
 * 解答の正規化と、穴埋め（cloze）の判定。
 * 画面から切り離した純粋関数。仕様は docs/requirements.md の「F3 判定」。
 */

import { CLOSE_MIN_WORD_LENGTH } from "./constants";

export type Verdict = "correct" | "close" | "wrong";

/** 短縮形の展開表。判定では両側を展開してから比べる。 */
const CONTRACTIONS: Record<string, string> = {
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "that's": "that is",
  "there's": "there is",
  "what's": "what is",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "we'll": "we will",
  "they'll": "they will",
  "he'll": "he will",
  "she'll": "she will",
  "it'll": "it will",
  "i'd": "i would",
  "you'd": "you would",
  "we'd": "we would",
  "they'd": "they would",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "can't": "can not",
  "cannot": "can not",
  "couldn't": "could not",
  "won't": "will not",
  "wouldn't": "would not",
  "shouldn't": "should not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "let's": "let us",
};

/**
 * 語の列に正規化する。小文字化、アポストロフィの統一、句読点の除去、短縮形の展開。
 * 例: "We're  OK!" → ["we", "are", "ok"]
 */
export function normalizeWords(input: string): string[] {
  const lowered = input
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    // 語の中のアポストロフィ・ハイフン以外の記号は空白にする
    .replace(/[^a-z0-9'\- ]+/g, " ")
    .replace(/-/g, " ");
  const words: string[] = [];
  for (const raw of lowered.split(/\s+/)) {
    const w = raw.replace(/^'+|'+$/g, "");
    if (!w) continue;
    const expanded = CONTRACTIONS[w];
    if (expanded) words.push(...expanded.split(" "));
    else words.push(w);
  }
  return words;
}

/** 2つの文字列の編集距離（レーベンシュタイン距離）。 */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 同じ長さで、1か所だけ l と r が入れ替わっているか（聞き取りの誤りなので「惜しい」にしない）。 */
export function isLRSwap(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let diffs = 0;
  let lr = false;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] === actual[i]) continue;
    diffs++;
    const pair = expected[i] + actual[i];
    lr = pair === "lr" || pair === "rl";
  }
  return diffs === 1 && lr;
}

function compareWords(expected: string[], actual: string[]): Verdict {
  if (expected.length !== actual.length) return "wrong";
  let typos = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const a = actual[i];
    if (e === a) continue;
    if (e.length >= CLOSE_MIN_WORD_LENGTH && editDistance(e, a) === 1 && !isLRSwap(e, a)) {
      typos++;
      continue;
    }
    return "wrong";
  }
  return typos === 0 ? "correct" : "close";
}

/**
 * 穴埋めの判定。answer と accept（別解）のどれかと比べ、いちばん良い結果を返す。
 * - 大文字小文字・句読点は無視し、短縮形は展開して比べる
 * - 5文字以上の語で綴りが1文字違いなら "close"（惜しい）
 * - ただし l と r の入れ替え（spray → splay）は聞き取りの誤りなので "wrong"
 */
export function judgeCloze(
  input: string,
  answer: string,
  accept: readonly string[] = [],
): Verdict {
  const actual = normalizeWords(input);
  if (actual.length === 0) return "wrong";
  let best: Verdict = "wrong";
  for (const candidate of [answer, ...accept]) {
    const v = compareWords(normalizeWords(candidate), actual);
    if (v === "correct") return "correct";
    if (v === "close") best = "close";
  }
  return best;
}
