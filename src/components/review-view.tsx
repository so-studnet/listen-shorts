"use client";
/**
 * 復習の画面。今日が期日の問題を、期日の古い順に1問ずつ出す。
 * 聞き直しは何回でも無料。ヒントは使える。XP は基本点の半分（コンボ・スピードボーナスなし）。
 * 仕様は docs/requirements.md の F5。
 */
import { useMemo, useRef, useState } from "react";
import { newBadges, type BadgeDef } from "@/lib/domain/badges";
import {
  buildCatalog,
  resolveItem,
  type CatalogEntry,
} from "@/lib/domain/catalog";
import { REVIEW_INTERVALS_DAYS } from "@/lib/domain/constants";
import { levelFromXp } from "@/lib/domain/level";
import type { Item, Sentence } from "@/lib/domain/pack";
import { judgeItem, orderWords } from "@/lib/domain/quiz";
import { totalXp } from "@/lib/domain/records";
import {
  applyAnswer,
  dueEntries,
  nextDue,
  nextStage,
  reviewPoints,
  type ReviewEntry,
} from "@/lib/domain/review";
import { seededRandom, shuffle, shuffleNotIdentity } from "@/lib/domain/shuffle";
import { findAnswerSpan, wordCount } from "@/lib/domain/text";
import type { Verdict } from "@/lib/domain/answer";
import { newId } from "@/lib/id";
import { SAMPLE_PACK } from "@/lib/sample";
import { getStore, useAppData } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";
import { useSegmentPlayer } from "@/lib/youtube/use-segment-player";
import { ChoiceInput, ClozeInput, OrderInput } from "./answer-inputs";
import { SentenceView } from "./sentence-view";
import { primaryBtn, secondaryBtn } from "./ui";

type Outcome = {
  verdict: Verdict;
  points: number;
  /** 次の段。null は卒業 */
  stageAfter: number | null;
};

type Session = {
  seed: number;
  queue: ReviewEntry[];
  index: number;
  outcomes: Outcome[];
  xpBefore: number;
  done: boolean;
  badges: BadgeDef[];
};

const STAGE_LABEL = (stage: number) => `${REVIEW_INTERVALS_DAYS[stage]}日後`;

export function ReviewView() {
  const hydrated = useHydrated();
  if (!hydrated) return <p className="text-sm">読み込み中…</p>;
  return <Review />;
}

function Review() {
  const data = useAppData();
  const catalog = useMemo(
    () => buildCatalog(data.packs, SAMPLE_PACK),
    [data.packs],
  );
  const [session, setSession] = useState<Session | null>(null);
  // 画面を開いた時刻（期日の判定に使う）。描画のたびに Date.now() を呼ばないため
  const [openedAt] = useState(() => new Date());

  if (!session || (session.done && session.queue.length === 0)) {
    const due = dueEntries(data.review, openedAt).filter((e) =>
      resolveItem(catalog, e),
    );
    const next = nextDue(data.review, openedAt);
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-zinc-100 p-4 text-center dark:bg-zinc-800">
          <div className="text-xs">今日の復習</div>
          <div className="text-3xl font-bold" data-testid="due-count">
            {due.length} 問
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            キュー全体：{data.review.length} 問
          </div>
        </div>
        {due.length > 0 ? (
          <button
            className={primaryBtn}
            onClick={() =>
              setSession({
                seed: Math.floor(Math.random() * 2 ** 31),
                queue: due,
                index: 0,
                outcomes: [],
                xpBefore: totalXp(getStore().getSnapshot()),
                done: false,
                badges: [],
              })
            }
          >
            復習を始める
          </button>
        ) : (
          <p className="text-sm">
            今日の復習はありません。
            {next &&
              `次は ${next.at.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })} に ${next.count} 問です。`}
          </p>
        )}
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          フィードで間違えた問題（惜しいを含む）が、1日 → 3日 → 7日 → 14日 →
          30日の間隔で出ます。復習で正解すると次の間隔へ、間違えると1日後に戻ります。30日後の復習で正解すると卒業です。日付は午前4時に切り替わります。
        </p>
      </div>
    );
  }

  if (session.done) return <ReviewSummary session={session} onClose={() => setSession(null)} />;

  const ref = session.queue[session.index];
  const found = resolveItem(catalog, ref);

  const advance = (outcome: Outcome | null) => {
    const outcomes = outcome ? [...session.outcomes, outcome] : session.outcomes;
    const index = session.index + 1;
    if (index < session.queue.length) {
      setSession({ ...session, index, outcomes });
      return;
    }
    // 終わり：バッジを判定して保存する
    let badges: BadgeDef[] = [];
    const now = new Date().toISOString();
    getStore().update((d) => {
      badges = newBadges(d);
      if (badges.length === 0) return d;
      return {
        ...d,
        progress: {
          ...d.progress,
          badges: [
            ...d.progress.badges,
            ...badges.map((b) => ({ id: b.id, earnedAt: now })),
          ],
        },
      };
    });
    setSession({ ...session, index, outcomes, done: true, badges });
  };

  if (!found) {
    // パックが消えていた：キューから外して次へ
    return (
      <SkipMissing
        onSkip={() => {
          getStore().update((d) => ({
            ...d,
            review: d.review.filter(
              (e) => !(e.packId === ref.packId && e.itemId === ref.itemId),
            ),
          }));
          advance(null);
        }}
      />
    );
  }

  return (
    <ReviewQuestion
      key={`${ref.packId}/${ref.itemId}#${session.index}`}
      position={`${session.index + 1} / ${session.queue.length}`}
      entry={found.entry}
      item={found.item}
      sentence={found.sentence}
      stage={ref.stage}
      seed={session.seed + session.index}
      onDone={advance}
    />
  );
}

function SkipMissing({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">この問題のパックは削除されています。</p>
      <button className={primaryBtn} onClick={onSkip}>
        飛ばす
      </button>
    </div>
  );
}

function ReviewQuestion({
  position,
  entry,
  item,
  sentence,
  stage,
  seed,
  onDone,
}: {
  position: string;
  entry: CatalogEntry;
  item: Item;
  sentence: Sentence;
  stage: number;
  seed: number;
  onDone: (o: Outcome) => void;
}) {
  const { clip, pack } = entry;
  const containerRef = useRef<HTMLDivElement>(null);
  const player = useSegmentPlayer(containerRef, clip.videoId, sentence.start);
  const [hintUsed, setHintUsed] = useState(false);
  const [replays, setReplays] = useState(0);
  const [shownAt] = useState(() => Date.now());
  const [outcome, setOutcome] = useState<(Outcome & { input: string }) | null>(null);
  const [choices] = useState(() =>
    item.type === "choice" ? shuffle(item.options, seededRandom(seed)) : [],
  );
  const [cards] = useState(() =>
    item.type === "order"
      ? shuffleNotIdentity(orderWords(item), seededRandom(seed), (w) =>
          w.toLowerCase(),
        )
      : [],
  );
  const span = findAnswerSpan(sentence.text, item.answer, item.occurrence ?? 1);

  const play = (start: number, end: number) => {
    setReplays((n) => n + 1);
    player.playSegment(start, end);
  };

  const submit = (input: string) => {
    player.stop();
    const verdict = judgeItem(item, input);
    const points = reviewPoints(verdict, hintUsed);
    const now = new Date();
    const stageAfter = verdict === "correct" ? nextStage(stage) : 0;
    getStore().update((d) => ({
      ...d,
      review: applyAnswer(
        d.review,
        { packId: pack.packId, clipId: clip.clipId, itemId: item.itemId },
        verdict,
        "review",
        now,
      ),
      answers: [
        ...d.answers,
        {
          id: newId(),
          answeredAt: now.toISOString(),
          source: "review",
          packId: pack.packId,
          clipId: clip.clipId,
          itemId: item.itemId,
          type: item.type,
          tags: item.tags,
          accent: clip.accent,
          difficulty: clip.difficulty,
          input,
          verdict,
          replays,
          elapsedMs: now.getTime() - shownAt,
          hintUsed,
          speedBonus: 0,
          points,
        },
      ],
    }));
    setOutcome({ verdict, points, stageAfter, input });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="review-question">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        復習 {position}・{clip.title}・{clip.accent}
      </p>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <div ref={containerRef} className="absolute inset-0" />
        {player.error && (
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center bg-zinc-900 p-4 text-center text-sm text-white"
          >
            {player.error}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          className={`${secondaryBtn} text-sm`}
          onClick={() => play(sentence.start, sentence.end)}
          disabled={!player.ready || player.playing}
        >
          🔁 文を聞く
        </button>
        <button
          className={`${secondaryBtn} text-sm`}
          onClick={() => play(clip.start, clip.end)}
          disabled={!player.ready || player.playing}
        >
          📺 全体
        </button>
      </div>

      <SentenceView text={sentence.text} span={span} blank={!outcome} />

      {!outcome && item.type === "cloze" && (
        <ClozeInput
          answer={item.answer}
          words={wordCount(item.answer)}
          hintUsed={hintUsed}
          onHint={() => setHintUsed(true)}
          onSubmit={submit}
        />
      )}
      {!outcome && item.type === "choice" && (
        <ChoiceInput options={choices} onSubmit={submit} />
      )}
      {!outcome && item.type === "order" && (
        <OrderInput cards={cards} onSubmit={submit} />
      )}

      {outcome && (
        <>
          <div
            role="status"
            className={`rounded-xl p-3 text-center ${outcome.verdict === "correct" ? "bg-emerald-100 dark:bg-emerald-900" : outcome.verdict === "close" ? "bg-amber-100 dark:bg-amber-900" : "bg-rose-100 dark:bg-rose-900"}`}
          >
            <p className="text-lg font-bold">
              {outcome.verdict === "correct"
                ? "正解！"
                : outcome.verdict === "close"
                  ? "惜しい！（綴りミス）"
                  : "不正解"}
              （+{outcome.points}）
            </p>
            <p className="text-xs" data-testid="next-review">
              {outcome.stageAfter === null
                ? "🎓 卒業！この問題はもう出ません"
                : outcome.verdict === "correct"
                  ? `次の復習は ${STAGE_LABEL(outcome.stageAfter)}`
                  : "最初に戻りました。次の復習は1日後"}
            </p>
          </div>
          {outcome.verdict !== "correct" && (
            <p className="text-sm">
              あなたの答え：<span className="font-mono">{outcome.input}</span>
            </p>
          )}
          {sentence.ja && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{sentence.ja}</p>
          )}
          <p className="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            💡 {item.note}
          </p>
          <button
            className={primaryBtn}
            onClick={() => onDone(outcome)}
            autoFocus
          >
            次へ
          </button>
        </>
      )}
    </div>
  );
}

function ReviewSummary({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const data = useAppData();
  const correct = session.outcomes.filter((o) => o.verdict === "correct").length;
  const xp = session.outcomes.reduce((n, o) => n + o.points, 0);
  const graduated = session.outcomes.filter((o) => o.stageAfter === null).length;
  const before = levelFromXp(session.xpBefore);
  const after = levelFromXp(totalXp(data));
  return (
    <div className="flex flex-col gap-4" data-testid="review-summary">
      {after.level > before.level && (
        <div className="rounded-xl bg-amber-100 p-3 text-center text-lg font-bold dark:bg-amber-900">
          🎉 レベルアップ！ Lv {after.level}
        </div>
      )}
      {session.badges.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl bg-emerald-100 p-3 text-sm dark:bg-emerald-900">
          <div className="font-bold">🏅 バッジを獲得</div>
          {session.badges.map((b) => (
            <div key={b.id}>
              {b.icon} {b.name}
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl bg-sky-100 p-4 text-center dark:bg-sky-900">
        <div className="text-xs">復習の結果</div>
        <div className="text-3xl font-bold">
          {correct} / {session.outcomes.length} 正解
        </div>
        <div className="text-sm">
          +{xp} XP{graduated > 0 && `・🎓 卒業 ${graduated} 問`}
        </div>
      </div>
      <button className={primaryBtn} onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}
