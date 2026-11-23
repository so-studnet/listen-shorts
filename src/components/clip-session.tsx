"use client";
/**
 * 1本のクリップ：視聴 → クイズ → 結果。
 * 進行は src/lib/domain/quiz.ts の quizReducer。保存は onAnswer / onFinish で親に任せる。
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { sentenceOf } from "@/lib/domain/catalog";
import { LIVES, SPEED_BONUS } from "@/lib/domain/constants";
import type { Clip, Item, Pack } from "@/lib/domain/pack";
import {
  activeElapsedMs,
  initQuiz,
  quizReducer,
  sentenceReplayCost,
  summarize,
  type QuestionResult,
  type QuizState,
  type QuizSummary,
} from "@/lib/domain/quiz";
import type { BadgeDef } from "@/lib/domain/badges";
import { levelFromXp } from "@/lib/domain/level";
import { comboMultiplier } from "@/lib/domain/scoring";
import { findAnswerSpan, wordCount } from "@/lib/domain/text";
import { useSegmentPlayer } from "@/lib/youtube/use-segment-player";
import { ChoiceInput, ClozeInput, OrderInput } from "./answer-inputs";
import { SentenceView } from "./sentence-view";
import { primaryBtn, secondaryBtn } from "./ui";

type Props = {
  pack: Pack;
  clip: Clip;
  /** 開いたときのコンボ（クリップをまたいで続く） */
  initialCombo: number;
  retry: boolean;
  onAnswer: (item: Item, result: QuestionResult) => void;
  onFinish: (summary: QuizSummary) => void;
  onNext: () => void;
  /** クイズ中（スワイプで次へ行かせたくない間）は true */
  onLockChange?: (locked: boolean) => void;
  /** 解き終えたあとのご褒美（親が保存のときに計算する） */
  rewards?: Rewards | null;
};

export type Rewards = {
  xpBefore: number;
  xpAfter: number;
  badges: BadgeDef[];
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

const TYPE_PROMPT = {
  cloze: "聞こえた語を入力",
  choice: "聞こえた方を選ぶ",
  order: "聞こえた順に並べる",
} as const;

/** 問題の表示中だけ、250ms ごとに現在時刻を更新する。 */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 250);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [active]);
  return now;
}

export function ClipSession({
  pack,
  clip,
  initialCombo,
  retry,
  onAnswer,
  onFinish,
  onNext,
  onLockChange,
  rewards,
}: Props) {
  const [state, dispatch] = useReducer(
    quizReducer,
    clip,
    (c): QuizState => initQuiz(c, { combo: initialCombo, retry }),
  );
  const [watched, setWatched] = useState(false);
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);

  const onSegmentEnd = useCallback(() => setWatched(true), []);
  const onStop = useCallback(
    () => dispatch({ type: "playbackEnded", now: Date.now() }),
    [],
  );
  const player = useSegmentPlayer(containerRef, clip.videoId, clip.start, {
    onSegmentEnd,
    onStop,
  });

  const phase = state.phase;
  const now = useTicker(phase.kind === "question");
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
  const startQuiz = () => {
    player.stop();
    onLockChange?.(state.items.length > 0);
    dispatch({
      type: "startQuiz",
      now: Date.now(),
      seed: Math.floor(Math.random() * 2 ** 31),
    });
  };
  const replaySentence = () => {
    if (!sentence) return;
    dispatch({ type: "replaySentence", now: Date.now() });
    player.playSegment(sentence.start, sentence.end);
  };
  const replayWhole = () => {
    dispatch({ type: "replayWhole", now: Date.now() });
    player.playSegment(clip.start, clip.end);
  };
  const submit = (input: string) => {
    if (!item || phase.kind !== "question") return;
    player.stop();
    const action = { type: "submit", input, now: Date.now() } as const;
    const next = quizReducer(state, action);
    dispatch(action);
    const result = next.results[next.results.length - 1];
    if (result) onAnswer(item, result);
  };
  const goNext = () => {
    player.stop();
    const action = { type: "next", now: Date.now() } as const;
    const next = quizReducer(state, action);
    dispatch(action);
    if (next.phase.kind === "result" && !finishedRef.current) {
      finishedRef.current = true;
      onLockChange?.(false);
      onFinish(summarize(next));
    }
  };

  // 文の聞き直しは、各問題の初回は無料
  const sentenceCost = sentenceReplayCost(state);
  const canReplay = (cost: number) =>
    player.ready && !player.playing && state.lives >= cost;

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
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center bg-zinc-900 p-4 text-center text-sm text-white"
          >
            {player.error}
          </div>
        )}
      </div>

      {phase.kind !== "watching" && phase.kind !== "result" && (
        <Hud
          lives={state.lives}
          combo={state.combo}
          speedLeftMs={
            phase.kind === "question" && item
              ? SPEED_BONUS.limitMs[item.type] -
                activeElapsedMs(phase, Math.max(now, phase.shownAt))
              : null
          }
          paused={phase.kind === "question" && phase.playbackStartedAt !== null}
        />
      )}

      {phase.kind === "watching" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            字幕なしで1回聞きます。聞き終わったらクイズに進みます（
            {state.items.length} 問）。
          </p>
          {!started && !player.error && (
            <button
              className={primaryBtn}
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
              className={watched || player.error ? primaryBtn : secondaryBtn}
              onClick={startQuiz}
            >
              クイズへ進む
            </button>
          )}
        </div>
      )}

      {phase.kind === "question" && item && sentence && (
        <div className="flex flex-col gap-3" key={item.itemId}>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            問題 {state.index + 1} / {state.items.length}・
            {TYPE_PROMPT[item.type]}
          </p>
          <SentenceView text={sentence.text} span={span} blank />
          {item.type === "cloze" && (
            <ClozeInput
              answer={item.answer}
              words={wordCount(item.answer)}
              hintUsed={phase.hintUsed}
              onHint={() => dispatch({ type: "useHint" })}
              onSubmit={submit}
            />
          )}
          {item.type === "choice" && (
            <ChoiceInput
              options={state.choices[item.itemId] ?? item.options}
              onSubmit={submit}
            />
          )}
          {item.type === "order" && (
            <OrderInput cards={state.cards[item.itemId] ?? []} onSubmit={submit} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className={`${secondaryBtn} text-sm`}
              onClick={replaySentence}
              disabled={!canReplay(sentenceCost)}
            >
              🔁 文を聞く（{sentenceCost === 0 ? "無料" : `❤️${sentenceCost}`}）
            </button>
            <button
              type="button"
              className={`${secondaryBtn} text-sm`}
              onClick={replayWhole}
              disabled={!canReplay(LIVES.fullReplayCost)}
            >
              📺 全体（❤️{LIVES.fullReplayCost}）
            </button>
          </div>
          {player.playing && (
            <p className="text-center text-sm">再生中…（時間は止まっています）</p>
          )}
        </div>
      )}

      {phase.kind === "feedback" && item && sentence && (
        <div className="flex flex-col gap-3">
          <div
            className={`rounded-xl p-3 text-center ${VERDICT_STYLE[phase.result.verdict]}`}
            role="status"
          >
            <p className="text-lg font-bold">
              {VERDICT_LABEL[phase.result.verdict]}（+{phase.result.points}）
            </p>
            <p className="text-xs" data-testid="score-detail">
              {scoreDetail(phase.result)}
            </p>
          </div>
          <SentenceView text={sentence.text} span={span} blank={false} />
          {phase.result.verdict !== "correct" && (
            <p className="text-sm">
              あなたの答え：
              <span className="font-mono">{phase.result.input}</span>
            </p>
          )}
          <p className="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            💡 {item.note}
          </p>
          <button className={primaryBtn} onClick={goNext} autoFocus>
            {state.index + 1 < state.items.length ? "次の問題" : "結果を見る"}
          </button>
          <button
            className={secondaryBtn}
            onClick={() => player.playSegment(sentence.start, sentence.end)}
            disabled={!player.ready || player.playing}
          >
            🔁 もう一度聞く（無料）
          </button>
        </div>
      )}

      {phase.kind === "result" && (
        <ResultView
          clip={clip}
          state={state}
          rewards={rewards ?? null}
          onPlay={(s, e) => player.playSegment(s, e)}
          canPlay={player.ready && !player.playing}
          onNext={onNext}
        />
      )}
    </section>
  );
}

function scoreDetail(r: QuestionResult): string {
  if (r.verdict === "wrong") return "コンボが切れました";
  const parts: string[] = [];
  if (r.multiplier > 1) parts.push(`🔥コンボ×${r.multiplier}`);
  if (r.hintUsed) parts.push("ヒントで半分");
  if (r.speedBonus > 0) parts.push(`⚡スピード+${r.speedBonus}`);
  if (r.verdict === "close") parts.push("惜しいは半分・コンボは維持");
  return parts.join("・") || `${r.comboAfter} 連続正解`;
}

function Hud({
  lives,
  combo,
  speedLeftMs,
  paused,
}: {
  lives: number;
  combo: number;
  speedLeftMs: number | null;
  paused: boolean;
}) {
  const speedSec =
    speedLeftMs === null ? null : Math.max(0, Math.ceil(speedLeftMs / 1000));
  return (
    <div
      className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800"
      data-testid="hud"
    >
      <span aria-label={`ライフ ${lives}`}>
        {"❤️".repeat(lives)}
        {"🤍".repeat(Math.max(0, LIVES.perClip - lives))}
      </span>
      <span data-testid="combo">
        {combo > 0
          ? `🔥 ${combo} 連続（×${comboMultiplier(combo)}）`
          : "🔥 0"}
      </span>
      {speedSec !== null && (
        <span
          data-testid="speed"
          className={speedSec === 0 ? "text-zinc-400" : ""}
        >
          ⚡ {speedSec === 0 ? "—" : `${speedSec}秒`}
          {paused && speedSec > 0 && "⏸"}
        </span>
      )}
    </div>
  );
}

function ResultView({
  clip,
  state,
  rewards,
  onPlay,
  canPlay,
  onNext,
}: {
  clip: Clip;
  state: QuizState;
  rewards: Rewards | null;
  onPlay: (start: number, end: number) => void;
  canPlay: boolean;
  onNext: () => void;
}) {
  const s = summarize(state);
  const rate = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  const misses = state.results.filter((r) => r.verdict !== "correct");
  const lvBefore = rewards ? levelFromXp(rewards.xpBefore) : null;
  const lvAfter = rewards ? levelFromXp(rewards.xpAfter) : null;
  return (
    <div className="flex flex-col gap-4" data-testid="result">
      {lvBefore && lvAfter && lvAfter.level > lvBefore.level && (
        <div
          className="rounded-xl bg-amber-100 p-3 text-center dark:bg-amber-900"
          data-testid="level-up"
        >
          <div className="text-lg font-bold">🎉 レベルアップ！ Lv {lvAfter.level}</div>
          {lvAfter.title !== lvBefore.title && (
            <div className="text-sm">新しい称号：{lvAfter.title}</div>
          )}
        </div>
      )}
      {rewards && rewards.badges.length > 0 && (
        <div
          className="flex flex-col gap-1 rounded-xl bg-emerald-100 p-3 dark:bg-emerald-900"
          data-testid="new-badges"
        >
          <div className="text-sm font-bold">🏅 バッジを獲得</div>
          {rewards.badges.map((b) => (
            <div key={b.id} className="text-sm">
              {b.icon} {b.name}：{b.description}
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl bg-sky-100 p-4 text-center dark:bg-sky-900">
        <div className="text-xs">獲得 XP{state.retry && "（再挑戦は半分）"}</div>
        <div className="text-3xl font-bold" data-testid="earned-xp">
          +{s.points}
        </div>
        <div className="text-xs">
          問題 {s.questionPoints} ＋ 残りライフ {s.livesLeft}×
          {LIVES.pointsPerRemainingLife}
          {state.retry && "÷2"} = {s.lifeBonus}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="正答率" value={`${rate}%`} />
        <Stat label="正解" value={`${s.correct}/${s.total}`} />
        <Stat label="最大コンボ" value={String(s.maxCombo)} />
      </div>
      {misses.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold">間違えた問題</h3>
          {misses.map((r) => {
            const item = state.items.find((i) => i.itemId === r.itemId)!;
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
      <button className={primaryBtn} onClick={onNext}>
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
