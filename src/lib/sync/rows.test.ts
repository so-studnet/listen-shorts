import { describe, expect, it } from "vitest";
import sample from "@/data/sample-pack.json";
import { validatePack, type Pack } from "@/lib/domain/pack";
import { EMPTY_DATA, type AnswerLog, type AppData } from "@/lib/domain/records";
import {
  answerToRow,
  clipResultToRow,
  diffAppData,
  hasLocalData,
  isEmptyDiff,
  mergeAppData,
  packToRow,
  progressToRow,
  reviewToRow,
  rowsToAppData,
} from "./rows";

const pack = (validatePack(sample) as { ok: true; pack: Pack }).pack;
const answer = (id: string, over: Partial<AnswerLog> = {}): AnswerLog => ({
  id,
  sessionId: "s1",
  answeredAt: "2026-11-22T03:00:00.000Z",
  source: "feed",
  packId: "sample",
  clipId: "c001",
  itemId: "sample-c001-q1",
  type: "cloze",
  tags: ["l_r"],
  accent: "UK",
  difficulty: 2,
  input: "Alizona",
  verdict: "wrong",
  replays: 1,
  elapsedMs: 3000,
  hintUsed: false,
  speedBonus: 0,
  points: 0,
  ...over,
});

const data: AppData = {
  packs: [{ importedAt: "2026-11-21T00:00:00.000Z", pack }],
  answers: [answer("a1"), answer("a2", { sessionId: undefined, verdict: "correct", points: 120, speedBonus: 20 })],
  clipResults: [
    {
      id: "s1",
      finishedAt: "2026-11-22T03:05:00.000Z",
      packId: "sample",
      clipId: "c001",
      source: "feed",
      total: 4,
      correct: 3,
      points: 400,
      lifeBonus: 60,
      livesLeft: 2,
      maxCombo: 3,
    },
  ],
  review: [
    {
      packId: "sample",
      clipId: "c001",
      itemId: "sample-c001-q1",
      stage: 0,
      dueAt: "2026-11-22T19:00:00.000Z",
      lastAnsweredAt: "2026-11-22T03:00:00.000Z",
    },
  ],
  progress: { combo: 2, badges: [{ id: "first_clear", earnedAt: "2026-11-22T03:05:00.000Z" }] },
  feedFilter: { packId: null, accent: "UK", difficulty: null },
};

/** DB から返る形（日時は +00:00）にする */
const fromDb = (d: AppData) => ({
  packs: d.packs.map(packToRow).map((r) => ({ ...r, imported_at: r.imported_at.replace(".000Z", "+00:00") })),
  answers: d.answers.map(answerToRow).map((r) => ({ ...r, answered_at: r.answered_at.replace(".000Z", "+00:00") })),
  clipResults: d.clipResults.map(clipResultToRow),
  review: d.review.map(reviewToRow),
  progress: progressToRow(d),
});

describe("rows", () => {
  it("アプリ → 行 → アプリで元に戻る（日時の形もそろう）", () => {
    const back = rowsToAppData(fromDb(data));
    expect(back).toEqual({
      ...data,
      answers: [data.answers[0], { ...data.answers[1] }],
    });
    expect(back.answers[1]).not.toHaveProperty("sessionId");
  });

  it("進み具合の行がなければ初期値", () => {
    const back = rowsToAppData({ packs: [], answers: [], clipResults: [], review: [], progress: null });
    expect(back).toEqual(EMPTY_DATA);
  });

  it("壊れた行は捨てる", () => {
    const rows = fromDb(data);
    rows.answers.push({ ...rows.answers[0], id: "bad", verdict: "maybe" as never });
    expect(rowsToAppData(rows).answers.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
});

describe("diffAppData", () => {
  it("変化がなければ空", () => {
    expect(isEmptyDiff(diffAppData(data, data))).toBe(true);
    expect(isEmptyDiff(diffAppData(data, { ...data, answers: [...data.answers] }))).toBe(true);
  });

  it("解答は足されたものだけ送る。復習は変わったものと消えたもの", () => {
    const next: AppData = {
      ...data,
      answers: [...data.answers, answer("a3")],
      review: [{ ...data.review[0], stage: 1 }],
      progress: { ...data.progress, combo: 0 },
    };
    const d = diffAppData(data, next);
    expect(d.answers.upserts.map((r) => r.id)).toEqual(["a3"]);
    expect(d.review.upserts.map((r) => [r.id, r.stage])).toEqual([["sample/sample-c001-q1", 1]]);
    expect(d.progress?.combo).toBe(0);
    expect(d.packs.upserts).toEqual([]);

    const removed = diffAppData(next, { ...next, review: [], packs: [] });
    expect(removed.review.deletes).toEqual(["sample/sample-c001-q1"]);
    expect(removed.packs.deletes).toEqual(["sample"]);
  });

  it("すべて削除すると、すべての id を消す", () => {
    const d = diffAppData(data, EMPTY_DATA);
    expect(d.answers.deletes).toEqual(["a1", "a2"]);
    expect(d.clipResults.deletes).toEqual(["s1"]);
    expect(d.progress).toEqual({ combo: 0, badges: [], feed_filter: { packId: null, accent: null, difficulty: null } });
  });
});

describe("mergeAppData / hasLocalData", () => {
  it("同じ id はサーバー側、ほかは足す。バッジは合わせる。コンボと絞り込みはサーバー側", () => {
    const server: AppData = { ...data, answers: [answer("a1", { input: "server" })] };
    const local: AppData = {
      ...EMPTY_DATA,
      answers: [answer("a1", { input: "local" }), answer("a9")],
      progress: { combo: 7, badges: [{ id: "no_miss", earnedAt: "t" }, { id: "first_clear", earnedAt: "x" }] },
    };
    const m = mergeAppData(server, local);
    expect(m.answers.map((a) => [a.id, a.input])).toEqual([["a1", "server"], ["a9", "Alizona"]]);
    expect(m.progress.combo).toBe(2);
    expect(m.progress.badges.map((b) => b.id)).toEqual(["first_clear", "no_miss"]);
    expect(m.feedFilter).toEqual(server.feedFilter);
  });
  it("取り込むものがあるか", () => {
    expect(hasLocalData(EMPTY_DATA)).toBe(false);
    expect(hasLocalData({ ...EMPTY_DATA, progress: { combo: 3, badges: [] } })).toBe(false);
    expect(hasLocalData(data)).toBe(true);
  });
});
