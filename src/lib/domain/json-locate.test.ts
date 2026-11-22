import { describe, expect, it } from "vitest";
import { lineForPath, locateJson } from "./json-locate";

const sample = `{
  "packId": "p",
  "clips": [
    {
      "clipId": "c1",
      "items": [
        { "itemId": "q1", "answer": "x" },
        {
          "itemId": "q2"
        }
      ]
    }
  ]
}`;

describe("locateJson：行番号の記録", () => {
  it("JSON.parse と同じ値を返し、各値の行を持つ", () => {
    const r = locateJson(sample);
    if (!r.ok) throw new Error(r.message);
    expect(r.value).toEqual(JSON.parse(sample));
    expect(r.lines.get("packId")).toBe(2);
    expect(r.lines.get("clips[0].clipId")).toBe(5);
    expect(r.lines.get("clips[0].items[0].answer")).toBe(7);
    expect(r.lines.get("clips[0].items[1]")).toBe(8);
    expect(r.lines.get("clips[0].items[1].itemId")).toBe(9);
  });
  it("足りない項目は、それを持つべきオブジェクトの行", () => {
    const r = locateJson(sample);
    if (!r.ok) throw new Error();
    expect(lineForPath(r.lines, ["clips", 0, "items", 1, "answer"])).toBe(8);
    expect(lineForPath(r.lines, ["title"])).toBe(1);
  });
  it("エスケープ・数値・真偽値・null", () => {
    const text = '{"a":"x\\"y\\u3042","b":[-1.5e2,true,false,null]}';
    const r = locateJson(text);
    expect(r.ok && r.value).toEqual(JSON.parse(text));
  });
});

describe("locateJson：書き方の誤り", () => {
  const err = (text: string) => {
    const r = locateJson(text);
    if (r.ok) throw new Error("通ってしまった");
    return r;
  };
  it("カンマ抜け：次の行を指し、前の行を疑うよう案内する", () => {
    const r = err('{\n  "a": 1\n  "b": 2\n}');
    expect([r.line, r.column]).toEqual([3, 3]);
    expect(r.message).toMatch(/カンマが抜けていませんか/);
  });
  it("最後の余分なカンマ", () => {
    expect(err('{\n  "a": [1, 2,]\n}').message).toMatch(/余分なカンマ/);
    expect(err('{\n  "a": 1,\n}').line).toBe(3);
  });
  it("' で囲んだ文字列、“ ” の引用符", () => {
    expect(err("{'a': 1}").message).toMatch(/' ではなく/);
    expect(err('{"a": “x”}').message).toMatch(/半角/);
  });
  it("閉じていない文字列、途中で終わる、末尾の余分な文字", () => {
    expect(err('{"a": "x\n}').message).toMatch(/閉じられていません/);
    expect(err('{"a": [1, 2').message).toMatch(/途中で終わっています|カンマ/);
    expect(err('{"a": 1} x').message).toMatch(/余分な文字/);
  });
});
