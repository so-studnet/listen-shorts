"use client";
/**
 * フィード：クリップを縦に並べ、1画面に1本表示する（scroll-snap で上下にスワイプ）。
 * YouTube のプレーヤーは、いま表示しているクリップだけに作る。
 * クイズ中はスワイプを止める（途中で次へ行って解答が消えないように）。
 */
import { useMemo, useRef, useState } from "react";
import { newBadges } from "@/lib/domain/badges";
import { applyAnswer } from "@/lib/domain/review";
import {
  isUsable,
  restoreQuiz,
  toSaved,
  type SavedQuiz,
  type SessionInfo,
} from "@/lib/domain/resume";
import type { QuizState } from "@/lib/domain/quiz";
import { clearResume, readResume, writeResume } from "@/lib/store/resume-storage";
import { useAuth } from "@/lib/supabase/use-auth";
import {
  buildCatalog,
  buildFeed,
  playedKeys,
  type CatalogEntry,
} from "@/lib/domain/catalog";
import { ACCENTS, type Item } from "@/lib/domain/pack";
import type { QuestionResult, QuizSummary } from "@/lib/domain/quiz";
import {
  NO_FILTER,
  totalXp,
  type AppData,
  type FeedFilter,
} from "@/lib/domain/records";
import { newId } from "@/lib/id";
import { SAMPLE_PACK } from "@/lib/sample";
import { getStore, useAppData } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";
import { ClipSession, type Rewards } from "./clip-session";
import { LevelBar } from "./level-bar";

export function Home() {
  const hydrated = useHydrated();
  if (!hydrated)
    return (
      <main className="flex flex-1 items-center justify-center text-sm">
        読み込み中…
      </main>
    );
  return <Feed />;
}

type Resume = { saved: SavedQuiz; state: QuizState; key: string };

function Feed() {
  const data = useAppData();
  const auth = useAuth();
  const owner = auth.status === "signed-in" ? auth.userId : "local";
  const catalog = useMemo(
    () => buildCatalog(data.packs, SAMPLE_PACK),
    [data.packs],
  );
  // 途中で閉じたクイズ（開いたときに1回だけ読む）
  const [saved, setSaved] = useState<SavedQuiz | null>(() => {
    const s = readResume();
    return s && isUsable(s, owner, new Date()) ? s : null;
  });
  // 再開するクリップは、このフィードを開いている間ずっと先頭に置く（解き終えても並びを変えない）
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  // 開いた時刻（再開した問題の残り時間をここから数える）
  const [openedAt] = useState(() => Date.now());
  const resume = useMemo((): Resume | null => {
    if (!saved) return null;
    const key = `${saved.packId}/${saved.clipId}`;
    // ログイン直後はパックがまだ届いていないことがあるので、見つかるまで待つ
    const entry = catalog.find((e) => e.key === key);
    if (!entry) return null;
    const state = restoreQuiz(saved, entry.clip, openedAt);
    return state ? { saved, state, key } : null;
  }, [saved, catalog, openedAt]);
  // パックが置き換わって戻せなかった途中経過は捨てる
  const savedKey = saved ? `${saved.packId}/${saved.clipId}` : null;
  const savedEntryExists = savedKey !== null && catalog.some((e) => e.key === savedKey);
  if (saved && savedEntryExists && !resume) {
    clearResume();
    setSaved(null);
  }
  if (resume && pinnedKey !== resume.key) setPinnedKey(resume.key);
  // 並び順を決めるときの「解いたクリップ」。解き終えた瞬間に並びが変わらないよう、
  // 開いたときと絞り込みを変えたときだけ取り直す
  const [playedAtOpen, setPlayedAtOpen] = useState(() =>
    playedKeys(data.clipResults),
  );
  const filter = data.feedFilter;
  const feed = useMemo(() => {
    const list = buildFeed(catalog, filter, playedAtOpen);
    const pinned = pinnedKey ? catalog.find((e) => e.key === pinnedKey) : undefined;
    return pinned ? [pinned, ...list.filter((e) => e.key !== pinned.key)] : list;
  }, [catalog, filter, playedAtOpen, pinnedKey]);
  const playedNow = playedKeys(data.clipResults);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [locked, setLocked] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  // 絞り込みを変えるたびに増やす。同じクリップが同じ位置に来ても作り直すため
  const [feedVersion, setFeedVersion] = useState(0);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.clientHeight === 0) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== active) setActive(i);
  };

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
  };

  const setFilter = (f: FeedFilter) => {
    getStore().update((d) => ({ ...d, feedFilter: f }));
    setPlayedAtOpen(playedKeys(getStore().getSnapshot().clipResults));
    setFeedVersion((v) => v + 1);
    setActive(0);
    scrollerRef.current?.scrollTo({ top: 0 });
  };

  const filtered =
    filter.packId !== null || filter.accent !== null || filter.difficulty !== null;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-md shrink-0 flex-col gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <LevelBar xp={totalXp(data)} compact />
          </div>
          <button
            className={`h-12 shrink-0 rounded-xl border px-3 text-sm ${filtered ? "border-sky-600 text-sky-700 dark:text-sky-300" : "border-zinc-300 dark:border-zinc-600"}`}
            onClick={() => setShowFilter((v) => !v)}
            aria-expanded={showFilter}
            disabled={locked}
          >
            絞り込み{filtered && "中"}
          </button>
        </div>
        {showFilter && !locked && (
          <FilterPanel
            filter={filter}
            packs={catalog
              .map((e) => e.pack)
              .filter((p, i, all) => all.findIndex((q) => q.packId === p.packId) === i)}
            onChange={setFilter}
          />
        )}
      </header>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        data-testid="feed"
        data-locked={locked ? "yes" : "no"}
        className={`min-h-0 flex-1 snap-y snap-mandatory ${locked ? "overflow-hidden" : "overflow-y-scroll"}`}
      >
        {feed.map((entry, i) => (
          <div
            key={`${entry.key}#${feedVersion}`}
            data-testid="slide"
            className="h-full snap-start snap-always overflow-y-auto overscroll-contain"
          >
            <div className="mx-auto w-full max-w-md px-4 pt-1 pb-6">
              {i === active ? (
                <SessionHost
                  entry={entry}
                  played={playedNow.has(entry.key)}
                  position={`${i + 1} / ${feed.length}`}
                  owner={owner}
                  resume={resume && resume.key === entry.key ? resume : null}
                  onResumeDone={() => setSaved(null)}
                  onLockChange={setLocked}
                  onNext={() => goTo(i + 1)}
                />
              ) : (
                <Preview entry={entry} played={playedNow.has(entry.key)} />
              )}
            </div>
          </div>
        ))}
        <div className="flex h-full snap-start flex-col items-center justify-center gap-3 px-6 text-center">
          {feed.length === 0 ? (
            <p className="text-sm">条件に合うクリップがありません。</p>
          ) : (
            <p className="text-sm">
              ここまでで {feed.length} 本です。設定からパックを足すか、絞り込みを変えてください。
            </p>
          )}
          {filtered && (
            <button
              className="h-12 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-600"
              onClick={() => setFilter(NO_FILTER)}
            >
              絞り込みを解除
            </button>
          )}
          {feed.length > 0 && (
            <button
              className="h-12 rounded-xl border border-zinc-300 px-4 text-sm dark:border-zinc-600"
              onClick={() => goTo(0)}
            >
              最初に戻る ↓
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function FilterPanel({
  filter,
  packs,
  onChange,
}: {
  filter: FeedFilter;
  packs: { packId: string; title: string }[];
  onChange: (f: FeedFilter) => void;
}) {
  const select =
    "h-12 w-full rounded-xl border border-zinc-300 bg-transparent px-2 text-base dark:border-zinc-600";
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="filter-panel">
      <label className="flex flex-col gap-1 text-xs">
        パック
        <select
          className={select}
          value={filter.packId ?? ""}
          onChange={(e) => onChange({ ...filter, packId: e.target.value || null })}
        >
          <option value="">すべて</option>
          {packs.map((p) => (
            <option key={p.packId} value={p.packId}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        アクセント
        <select
          className={select}
          value={filter.accent ?? ""}
          onChange={(e) =>
            onChange({
              ...filter,
              accent: (e.target.value || null) as FeedFilter["accent"],
            })
          }
        >
          <option value="">すべて</option>
          {ACCENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        難易度
        <select
          className={select}
          value={filter.difficulty ?? ""}
          onChange={(e) =>
            onChange({
              ...filter,
              difficulty: e.target.value ? Number(e.target.value) : null,
            })
          }
        >
          <option value="">すべて</option>
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** 表示していないクリップの簡単な表示（プレーヤーは作らない）。 */
function Preview({ entry, played }: { entry: CatalogEntry; played: boolean }) {
  const { clip, pack } = entry;
  return (
    <div className="flex flex-col gap-2 pt-1">
      <h2 className="text-base font-bold">{clip.title}</h2>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        {clip.channel}・{clip.accent}・難易度 {clip.difficulty}・{pack.title}
        {played && "・解いた"}
      </p>
      <div className="aspect-video w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

/** 1本のクリップの間だけ生きる。初回か再挑戦か、開始時のコンボは開いたときに決める。 */
function SessionHost({
  entry,
  played,
  position,
  owner,
  resume,
  onResumeDone,
  onLockChange,
  onNext,
}: {
  entry: CatalogEntry;
  played: boolean;
  position: string;
  owner: string;
  /** 途中から再開するときの、保存されていた途中経過 */
  resume: Resume | null;
  /** 途中経過を使い終えた（または使わなくなった）とき */
  onResumeDone: () => void;
  onLockChange: (locked: boolean) => void;
  onNext: () => void;
}) {
  // 途中から再開するときは、開いたときの情報（どの回か・初回か・XP）を引き継ぐ
  const [resumed] = useState(resume);
  const [source] = useState<"feed" | "retry">(
    resumed ? resumed.saved.source : played ? "retry" : "feed",
  );
  const [initialCombo] = useState(() => getStore().getSnapshot().progress.combo);
  const [sessionId] = useState(() => resumed?.saved.sessionId ?? newId());
  // レベルアップの判定に使う、クリップを開いた時点の XP（解答ごとに得点が保存されるため）
  const [xpAtOpen] = useState(
    () => resumed?.saved.xpAtOpen ?? totalXp(getStore().getSnapshot()),
  );
  const [rewards, setRewards] = useState<Rewards | null>(null);

  const info: SessionInfo = {
    owner,
    packId: entry.pack.packId,
    clipId: entry.clip.clipId,
    sessionId,
    source,
    xpAtOpen,
  };
  /** 解いている途中の状態を、この端末に保存する（閉じても続きから解けるように） */
  const onStateChange = (state: QuizState) => {
    if (state.phase.kind === "result") return; // 解き終えたら onFinish で消す
    const s = toSaved(state, info, new Date());
    if (!s) return;
    writeResume(s);
    // 別のクリップでクイズを始めたら、前の途中経過は使わない（あとから割り込ませない）
    if (!resumed) onResumeDone();
  };

  const onAnswer = (item: Item, r: QuestionResult) => {
    const now = new Date();
    getStore().update((d) => ({
      ...d,
      progress: { ...d.progress, combo: r.comboAfter },
      review: applyAnswer(
        d.review,
        {
          packId: entry.pack.packId,
          clipId: entry.clip.clipId,
          itemId: item.itemId,
        },
        r.verdict,
        source,
        now,
      ),
      answers: [
        ...d.answers,
        {
          id: newId(),
          sessionId,
          answeredAt: now.toISOString(),
          source,
          packId: entry.pack.packId,
          clipId: entry.clip.clipId,
          itemId: item.itemId,
          type: item.type,
          tags: item.tags,
          accent: entry.clip.accent,
          difficulty: entry.clip.difficulty,
          input: r.input,
          verdict: r.verdict,
          replays: r.replays,
          elapsedMs: r.elapsedMs,
          hintUsed: r.hintUsed,
          speedBonus: r.speedBonus,
          points: r.points,
        },
      ],
    }));
  };

  const onFinish = (s: QuizSummary) => {
    clearResume();
    if (resumed) onResumeDone();
    let got: Rewards | null = null;
    const now = new Date().toISOString();
    getStore().update((d) => {
      const withResult: AppData = {
        ...d,
        clipResults: [
          ...d.clipResults,
          {
            id: sessionId,
            finishedAt: now,
            packId: entry.pack.packId,
            clipId: entry.clip.clipId,
            source,
            total: s.total,
            correct: s.correct,
            points: s.points,
            lifeBonus: s.lifeBonus,
            livesLeft: s.livesLeft,
            maxCombo: s.maxCombo,
          },
        ],
      };
      const badges = newBadges(withResult);
      got = { xpBefore: xpAtOpen, xpAfter: totalXp(withResult), badges };
      return {
        ...withResult,
        progress: {
          ...withResult.progress,
          badges: [
            ...withResult.progress.badges,
            ...badges.map((b) => ({ id: b.id, earnedAt: now })),
          ],
        },
      };
    });
    setRewards(got);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        クリップ {position}
        {source === "retry" && "・再挑戦（XP 半分）"}
      </p>
      {resumed && (
        <p
          className="rounded-xl bg-sky-50 p-2 text-xs dark:bg-sky-950"
          data-testid="resumed"
        >
          前回の続き（問題 {resumed.state.index + 1} / {resumed.state.items.length}）から再開しました
        </p>
      )}
      <ClipSession
        pack={entry.pack}
        clip={entry.clip}
        initialCombo={initialCombo}
        retry={source === "retry"}
        onAnswer={onAnswer}
        onFinish={onFinish}
        onNext={onNext}
        onLockChange={onLockChange}
        rewards={rewards}
        initialState={resumed?.state}
        onStateChange={onStateChange}
      />
    </div>
  );
}
