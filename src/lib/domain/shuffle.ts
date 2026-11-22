/** 種（seed）から決まる乱数で並べ替える。テストで結果を固定できるようにするため。 */

/** mulberry32：32ビットの種から 0〜1 の乱数を出す関数を作る。 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates。元の配列は変えない。 */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 元の並びと同じにならないように並べ替える（並べ替え問題のカード用）。
 * key で比べ、すべて同じ key なら元のまま返す。
 */
export function shuffleNotIdentity<T>(
  items: readonly T[],
  rand: () => number,
  key: (t: T) => string = String,
): T[] {
  const original = items.map(key).join("\u0000");
  if (new Set(items.map(key)).size < 2) return [...items];
  for (let i = 0; i < 20; i++) {
    const out = shuffle(items, rand);
    if (out.map(key).join("\u0000") !== original) return out;
  }
  // 20回で同じにならなければ、先頭を末尾に回す（必ず変わる）
  const out = [...items.slice(1), items[0]];
  return out.map(key).join("\u0000") !== original ? out : [...items].reverse();
}
