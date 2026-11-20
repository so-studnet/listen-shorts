"use client";
/**
 * 1本のクリップ：視聴 → クイズ → 結果。
 * 進行は src/lib/domain/quiz.ts の quizReducer。保存は onAnswer / onFinish で親に任せる。
 */
import { useCallback, useReducer, useRef, useState } from "react";
import { sentenceOf } from "@/lib/domain/catalog";
import type { Clip, Item, Pack } from "@/lib/domain/pack";
import {
  initQuiz,
  quizReducer,
  summarize,
  type QuestionResult,
} from "@/lib/domain/quiz";
import { findAnswerSpan } from "@/lib/domain/text";
import { useSegmentPlayer } from "@/lib/youtube/use-segment-player";
import { SentenceView } from "./sentence-view";

type Props = {
  pack: Pack;
  clip: Clip;
  onAnswer: (item: Item, result: QuestionResult) => void;
  onFinish: (results: QuestionResult[]) => void;
  onNext: () => void;
};

const VERDICT_LABEL = {
  correct: "正解！",
  close: "惜しい！（綴りミス）",
  wrong: "不正解",
} as const;

const VERDICT_STYLE = {
  correct: "bg-emerald-100 dark:bg-emerald-900",
  close: "bg-amber-100 dark:bg-amber-900",
  wrong: "bg-rose-100 dark:bg-rose-900",
} as const;

const btn =
  "h-12 w-full rounded-xl px-4 text-base font-semibold disabled:opacity-40";
const primary = `${btn} bg-sky-600 text-white active:bg-sky-700`;
const secondary = `${btn} border border-zinc-300 dark:border-zinc-600 active:bg-zinc-100 dark:active:bg-zinc-800`;

export function ClipSession({ pack, clip, onAnswer, onFinish, onNext }: Props) {
  const [state, dispatch] = useReducer(quizReducer, clip, initQuiz);
  const [watched, setWatched] = useState(false);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);

  const onSegmentEnd = useCallback(() => setWatched(true), []);
  const player = useSegmentPlayer(
    containerRef,
    clip.videoId,
    clip.start,
    onSegmentEnd,
  );

  const item = state.items[state.index] as Item | undefined;
  const sentence = item ? sentenceOf(clip, item.sid) : null;
  const span =
    item && sentence
      ? findAnswerSpan(sentence.text, item.answer, item.occurrence ?? 1)
      : null;

  const playWhole = () => {
    setStarted(true);
    player.playSegment(clip.start, clip.end);
  };
  const replaySentence = () => {
    if (!sentence) return;
    dispatch({ type: "replaySentence" });
    player.playSegment(sentence.start, sentence.end);
  };
  const startQuiz = () => {
    player.stop();
    dispatch({ type: "startQuiz", now: Date.now() });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || state.phase.kind !== "question" || !input.trim()) return;
    player.stop();
    const action = { type: "submit", input, now: Date.now() } as const;
    const next = quizReducer(state, action);
    dispatch(action);
    const result = next.results[next.results.length - 1];
    if (result) onAnswer(item, result);
  };
  const goNext = () => {
    setInput("");
    const action = { type: "next", now: Date.now() } as const;
    const next = quizReducer(state, action);
    dispatch(action);
    if (next.phase.kind === "result" && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(next.results);
    }
  };

  const phase = state.phase;

  return (
    <section className="flex flex-col gap-4" data-testid="clip-session">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-bold leading-snug">{clip.title}</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {clip.channel}・{clip.accent}・難易度 {clip.difficulty}・
          {pack.title}
        </p>
      </header>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <div ref={containerRef} className="absolute inset-0" />
        {player.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-white">
            {player.error}
          </div>
        )}
      </div>

      {phase.kind === "watching" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            字幕なしで1回聞きます。聞き終わったらクイズに進みます（
            {state.items.length} 問）。
          </p>
          {!started && (
            <button
              className={primary}
              onClick={playWhole}
              disabled={!player.ready}
            >
              {player.ready ? "▶ タップして再生" : "プレーヤーを準備中…"}
            </button>
          )}
          {started && player.playing && (
            <p className="text-center text-sm">再生中…</p>
          )}
          {(watched || started || player.error) && (
            <button
              className={watched ? primary : secondary}
              onClick={startQuiz}
            >
              クイズへ進む
            </button>
          )}
        </div>
      )}

      {phase.kind === "question" && item && sentence && (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            問題 {state.index + 1} / {state.items.length}・聞こえた語を入力
          </p>
          <SentenceView text={sentence.text} span={span} blank />
          <input
            className="h-12 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-600"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-label="答え"
            placeholder={`${span ? span.end - span.start : ""} 語`}
          />
          <button type="submit" className={primary} disabled={!input.trim()}>
            答える
          </button>
          <button
            type="button"
            className={secondary}
            onClick={replaySentence}
            disabled={!player.ready || player.playing}
          >
            {player.playing ? "再生中…" : "🔁 この文を聞き直す"}
          </button>
        </form>
      )}

      {phase.kind === "feedback" && item && sentence && (
        <div className="flex flex-col gap-3">
          <p
            className={`rounded-xl p-3 text-center text-lg font-bold ${VERDICT_STYLE[phase.result.verdict]}`}
            role="status"
          >
            {VERDICT_LABEL[phase.result.verdict]}（+{phase.result.points}）
          </p>
          <SentenceView text={sentence.text} span={span} blank={false} />
          {phase.result.verdict !== "correct" && (
            <p className="text-sm">
              あなたの答え：<span className="font-mono">{phase.result.input}</span>
            </p>
          )}
          <p className="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            💡 {item.note}
          </p>
          <button className={primary} onClick={goNext} autoFocus>
            {state.index + 1 < state.items.length ? "次の問題" : "結果を見る"}
          </button>
          <button
            className={secondary}
            onClick={() => player.playSegment(sentence.start, sentence.end)}
            disabled={!player.ready || player.playing}
          >
            🔁 もう一度聞く
          </button>
        </div>
      )}

      {phase.kind === "result" && (
        <ResultView
          clip={clip}
          results={state.results}
          items={state.items}
          onPlay={(s, e) => player.playSegment(s, e)}
          canPlay={player.ready && !player.playing}
          onNext={onNext}
        />
      )}
    </section>
  );
}

function ResultView({
  clip,
  results,
  items,
  onPlay,
  canPlay,
  onNext,
}: {
  clip: Clip;
  results: QuestionResult[];
  items: Item[];
  onPlay: (start: number, end: number) => void;
  canPlay: boolean;
  onNext: () => void;
}) {
  const s = summarize(results);
  const rate = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  const misses = results.filter((r) => r.verdict !== "correct");
  return (
    <div className="flex flex-col gap-4" data-testid="result">
      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label="正答率" value={`${rate}%`} />
        <Stat label="得点" value={String(s.points)} />
        <Stat label="正解" value={`${s.correct} / ${s.total}`} />
        <Stat label="惜しい" value={String(s.close)} />
      </div>
      {misses.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold">間違えた問題</h3>
          {misses.map((r) => {
            const item = items.find((i) => i.itemId === r.itemId)!;
            const sentence = sentenceOf(clip, item.sid);
            return (
              <div
                key={r.itemId}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <SentenceView
                  text={sentence.text}
                  span={findAnswerSpan(
                    sentence.text,
                    item.answer,
                    item.occurrence ?? 1,
                  )}
                  blank={false}
                />
                {sentence.ja && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {sentence.ja}
                  </p>
                )}
                <p className="text-sm">
                  あなたの答え：<span className="font-mono">{r.input}</span>（
                  {r.verdict === "close" ? "惜しい" : "不正解"}）
                </p>
                <p className="text-sm">💡 {item.note}</p>
                <button
                  className="h-12 rounded-xl border border-zinc-300 text-sm dark:border-zinc-600"
                  onClick={() => onPlay(sentence.start, sentence.end)}
                  disabled={!canPlay}
                >
                  🔁 この文を聞く
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button className={primary} onClick={onNext}>
        次のクリップ ↑
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
      <div className="text-xs text-zinc-600 dark:text-zinc-400">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
