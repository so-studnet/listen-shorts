import { describe, expect, it } from "vitest";
import sample from "@/data/sample-pack.json";
import { formatPath, parsePackJson, validatePack } from "./pack";

function clone<T>(v: T): T {
  return structuredClone(v);
}

describe("サンプルパック", () => {
  it("検証を通る", () => {
    const r = validatePack(sample);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
});

describe("validatePack", () => {
  it("answer が文の中にないとエラー（パスつき）", () => {
    const p = clone(sample);
    p.clips[0].items[0].answer = "Alizona";
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toContainEqual({
        path: "clips[0].items[0].answer",
        message: '文の中に"Alizona" が見つかりません',
      });
  });

  it("型の誤りは日本語のメッセージで返す", () => {
    const p = clone(sample) as Record<string, unknown>;
    p.version = "1";
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].path).toBe("version");
      expect(r.errors[0].message).toMatch(/無効な入力/);
    }
  });

  it("文の区間がクリップからはみ出すとエラー", () => {
    const p = clone(sample);
    p.clips[0].sentences[0].start = 1;
    const r = validatePack(p);
    expect(!r.ok && r.errors.some((e) => e.path === "clips[0].sentences[0].start")).toBe(true);
  });

  it("存在しない sid を指すとエラー", () => {
    const p = clone(sample);
    p.clips[0].items[0].sid = "s9";
    const r = validatePack(p);
    expect(!r.ok && r.errors[0].message).toMatch(/s9/);
  });

  it("choice の options に answer がないとエラー", () => {
    const p = clone(sample);
    const item = p.clips[1].items[1] as { options: string[] };
    item.options = ["right", "write"];
    const r = validatePack(p);
    expect(!r.ok && r.errors[0].message).toMatch(/answer が入っていません/);
  });

  it("cloze の語数が多すぎるとエラー", () => {
    const p = clone(sample);
    p.clips[0].items[0].answer = "we drove all the way";
    const r = validatePack(p);
    expect(!r.ok && r.errors[0].message).toMatch(/1〜4 語/);
  });

  it("itemId や clipId の重複はエラー", () => {
    const p = clone(sample);
    p.clips[1].clipId = "c001";
    p.clips[0].items[1].itemId = p.clips[0].items[0].itemId;
    const r = validatePack(p);
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual([
      "clips[0].items[1].itemId",
      "clips[1].clipId",
    ]);
  });

  it("ほかのパックと itemId が重なるときは警告だけ", () => {
    const r = validatePack(sample, new Set(["sample-c001-q1"]));
    expect(r.ok && r.warnings.length).toBe(1);
  });
});

describe("parsePackJson / formatPath", () => {
  it("JSON として読めなければエラー", () => {
    const r = parsePackJson("{ 'a': 1 }");
    expect(!r.ok && r.errors[0].path).toBe("(JSON)");
  });
  it("パスを整形する", () => {
    expect(formatPath(["clips", 0, "items", 1, "answer"])).toBe(
      "clips[0].items[1].answer",
    );
    expect(formatPath([])).toBe("(全体)");
  });
});
