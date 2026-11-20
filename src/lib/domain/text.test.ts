import { describe, expect, it } from "vitest";
import { findAnswerSpan, hintFor, tokenize, wordCount } from "./text";

describe("tokenize", () => {
  it("語の前後の記号を分ける", () => {
    const t = tokenize('"Okay, we’re here."');
    expect(t.map((x) => x.core)).toEqual(["Okay", "we’re", "here"]);
    expect(t[0].pre).toBe('"');
    expect(t[0].post).toBe(",");
    expect(t[2].post).toBe('."');
    expect(t[1].norm).toBe("we're");
  });
  it("記号だけの塊は捨てる", () => {
    expect(tokenize("well - known").map((x) => x.core)).toEqual([
      "well",
      "known",
    ]);
  });
});

describe("findAnswerSpan", () => {
  const text = "Okay, we got to start today with an absolutely bizarre story.";
  it("連続した語の位置を返す", () => {
    expect(findAnswerSpan(text, "an absolutely bizarre")).toEqual({
      start: 7,
      end: 10,
    });
  });
  it("大文字小文字と句読点を無視する", () => {
    expect(findAnswerSpan(text, "okay we")).toEqual({ start: 0, end: 2 });
    expect(findAnswerSpan(text, "bizarre story.")).toEqual({
      start: 9,
      end: 11,
    });
  });
  it("見つからなければ null", () => {
    expect(findAnswerSpan(text, "absolutly bizarre")).toBeNull();
    expect(findAnswerSpan(text, "")).toBeNull();
  });
  it("語の途中には一致しない", () => {
    expect(findAnswerSpan("I'm going to the store", "to")).toEqual({
      start: 2,
      end: 3,
    });
    expect(findAnswerSpan("the theory", "the")).toEqual({ start: 0, end: 1 });
  });
  it("occurrence で何回目かを指定できる", () => {
    const t = "I think that that is the thing that matters.";
    expect(findAnswerSpan(t, "that", 1)).toEqual({ start: 2, end: 3 });
    expect(findAnswerSpan(t, "that", 3)).toEqual({ start: 7, end: 8 });
    expect(findAnswerSpan(t, "that", 4)).toBeNull();
  });
});

describe("hintFor / wordCount", () => {
  it("各語の最初の1文字を見せる", () => {
    expect(hintFor("an absolutely bizarre")).toBe("a_ a_________ b______");
  });
  it("語数を数える", () => {
    expect(wordCount("we got to")).toBe(3);
  });
});
