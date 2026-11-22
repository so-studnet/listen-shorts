/**
 * JSON を読みながら、各値が何行目にあるかを記録する。
 * パックの検証エラーに行番号を付けるため（docs/requirements.md の F7）。
 * 書き方の誤り（カンマ抜けなど）は、行・列と日本語の説明を返す。
 */

export type PathSeg = string | number;

export type LocateResult =
  | { ok: true; value: unknown; lines: Map<string, number> }
  | { ok: false; line: number; column: number; message: string };

/** パスの配列を "clips[0].items[1].answer" の形にする（pack.ts の formatPath と同じ形）。 */
export function pathKey(path: readonly PathSeg[]): string {
  let out = "";
  for (const p of path) {
    if (typeof p === "number") out += `[${p}]`;
    else out += out ? `.${p}` : p;
  }
  return out;
}

class JsonSyntaxError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
  }
}

export function locateJson(text: string): LocateResult {
  const lines = new Map<string, number>();
  // 位置 → 行番号のために、各行の始まりの位置を持っておく
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (pos: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  let i = 0;
  const fail = (message: string, pos = i): never => {
    throw new JsonSyntaxError(message, pos);
  };
  const ws = () => {
    while (i < text.length && " \t\n\r﻿".includes(text[i])) i++;
  };
  const describe = (ch: string | undefined) =>
    ch === undefined ? "ファイルの終わり" : `「${ch}」`;

  const parseString = (): string => {
    const start = i;
    i++; // "
    let out = "";
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\n") fail("文字列の \" が閉じられていません", start);
      if (ch === "\\") {
        const next = text[i + 1];
        const map: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (next === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("\\u のあとは16進数4桁にしてください");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        if (next === undefined || !(next in map)) fail(`使えないエスケープ「\\${next ?? ""}」があります`);
        out += map[next];
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    return fail("文字列の \" が閉じられていません", start);
  };

  const parseValue = (path: PathSeg[], recordLine = true): unknown => {
    ws();
    if (recordLine) lines.set(pathKey(path), lineOf(i));
    const ch = text[i];
    if (ch === "{") {
      i++;
      const obj: Record<string, unknown> = {};
      ws();
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] === "}") fail("最後の項目のあとに余分なカンマ（,）があります");
        if (text[i] !== '"')
          fail(
            text[i] === "'"
              ? "項目名は ' ではなく \" で囲んでください"
              : `項目名（"…"）があるはずの場所に ${describe(text[i])} があります`,
          );
        const keyPos = i;
        const key = parseString();
        lines.set(pathKey([...path, key]), lineOf(keyPos));
        ws();
        if (text[i] !== ":") fail(`項目名 "${key}" のあとに「:」がありません`);
        i++;
        obj[key] = parseValue([...path, key], false);
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return obj;
        }
        fail(`カンマ（,）か } があるはずの場所に ${describe(text[i])} があります。前の行の終わりにカンマが抜けていませんか`);
      }
    }
    if (ch === "[") {
      i++;
      const arr: unknown[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        ws();
        if (text[i] === "]") fail("最後の要素のあとに余分なカンマ（,）があります");
        arr.push(parseValue([...path, arr.length]));
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          return arr;
        }
        fail(`カンマ（,）か ] があるはずの場所に ${describe(text[i])} があります。前の行の終わりにカンマが抜けていませんか`);
      }
    }
    if (ch === '"') return parseString();
    const lit = text.slice(i).match(/^(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (lit) {
      i += lit[0].length;
      return JSON.parse(lit[0]);
    }
    if (ch === "'") fail("文字列は ' ではなく \" で囲んでください");
    if (ch === "“" || ch === "”") fail("“ ” ではなく、半角の \" を使ってください");
    return fail(ch === undefined ? "途中で終わっています（} や ] が足りません）" : `値があるはずの場所に ${describe(ch)} があります`);
  };

  try {
    const value = parseValue([]);
    ws();
    if (i < text.length) fail(`JSON の終わりのあとに余分な文字 ${describe(text[i])} があります`);
    return { ok: true, value, lines };
  } catch (e) {
    if (!(e instanceof JsonSyntaxError)) throw e;
    const pos = Math.min(e.pos, text.length);
    const line = lineOf(pos);
    return { ok: false, line, column: pos - lineStarts[line - 1] + 1, message: e.message };
  }
}

/** パスに対応する行。なければ親をたどる（足りない項目は、それを持つべきオブジェクトの行）。 */
export function lineForPath(
  lines: ReadonlyMap<string, number>,
  path: readonly PathSeg[],
): number | undefined {
  for (let n = path.length; n >= 0; n--) {
    const l = lines.get(pathKey(path.slice(0, n)));
    if (l !== undefined) return l;
  }
  return undefined;
}
