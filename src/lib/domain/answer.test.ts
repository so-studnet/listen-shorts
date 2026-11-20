import { describe, expect, it } from "vitest";
import { editDistance, judgeCloze, normalizeWords } from "./answer";

describe("normalizeWords", () => {
  it("小文字化し、句読点を除く", () => {
    expect(normalizeWords("Okay, we GOT to start!")).toEqual([
      "okay",
      "we",
      "got",
      "to",
      "start",
    ]);
  });
  it("短縮形を展開し、曲がったアポストロフィも同じに扱う", () => {
    expect(normalizeWords("We’re here")).toEqual(["we", "are", "here"]);
    expect(normalizeWords("can't")).toEqual(["can", "not"]);
  });
  it("空白だけなら空", () => {
    expect(normalizeWords("   ")).toEqual([]);
  });
});

describe("editDistance", () => {
  it("1文字の置換・挿入・削除は1", () => {
    expect(editDistance("bizarre", "bizarr")).toBe(1);
    expect(editDistance("light", "right")).toBe(1);
    expect(editDistance("abc", "abc")).toBe(0);
  });
});

describe("judgeCloze", () => {
  it("大文字小文字と句読点を無視して正解", () => {
    expect(judgeCloze("An Absolutely bizarre.", "an absolutely bizarre")).toBe(
      "correct",
    );
  });
  it("短縮形の表記ゆれは正解", () => {
    expect(judgeCloze("we are", "we're")).toBe("correct");
    expect(judgeCloze("we're", "we are")).toBe("correct");
  });
  it("5文字以上の語で1文字違いなら惜しい", () => {
    expect(judgeCloze("an absolutly bizarre", "an absolutely bizarre")).toBe(
      "close",
    );
  });
  it("4文字以下の語の1文字違いは不正解（code/coke など）", () => {
    expect(judgeCloze("coke", "code")).toBe("wrong");
  });
  it("L と R の入れ替えは1文字違いでも不正解（聞き取りの誤り）", () => {
    expect(judgeCloze("splay", "spray")).toBe("wrong");
    expect(judgeCloze("Alizona", "Arizona")).toBe("wrong");
  });
  it("語数が違えば不正解（機能語の脱落）", () => {
    expect(judgeCloze("absolutely bizarre", "an absolutely bizarre")).toBe(
      "wrong",
    );
  });
  it("別解（accept）に一致すれば正解", () => {
    expect(judgeCloze("10", "ten", ["10"])).toBe("correct");
  });
  it("空の入力は不正解", () => {
    expect(judgeCloze("", "the")).toBe("wrong");
  });
});
