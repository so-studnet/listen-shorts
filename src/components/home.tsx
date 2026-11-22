"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildCatalog, type CatalogEntry } from "@/lib/domain/catalog";
import type { Item } from "@/lib/domain/pack";
import type { QuestionResult, QuizSummary } from "@/lib/domain/quiz";
import { totalXp } from "@/lib/domain/records";
import { newId } from "@/lib/id";
import { SAMPLE_PACK } from "@/lib/sample";
import { getStore, useAppData } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";
import { ClipSession } from "./clip-session";

export function Home() {
  const data = useAppData();
  const hydrated = useHydrated();
  const catalog = useMemo(
    () => buildCatalog(data.packs, SAMPLE_PACK),
    [data.packs],
  );
  const [index, setIndex] = useState(0);
  // セッション（クリップ）ごとに変わる番号。同じクリップをもう一度開いたときも作り直すため
  const [session, setSession] = useState(0);

  const entry = catalog[index % catalog.length];
  const played = data.clipResults.some(
    (r) => r.packId === entry.pack.packId && r.clipId === entry.clip.clipId,
  );

  const onNext = () => {
    setIndex((i) => (i + 1) % catalog.length);
    setSession((n) => n + 1);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <nav className="flex items-center justify-between">
        <h1 className="text-lg font-bold">ListenShorts</h1>
        <div className="flex items-center gap-3 text-sm">
          <span data-testid="total-points">{totalXp(data)} XP</span>
          <Link
            href="/packs"
            className="flex h-12 items-center rounded-xl border border-zinc-300 px-3 dark:border-zinc-600"
          >
            パック
          </Link>
        </div>
      </nav>
      {!hydrated ? (
        <p className="text-sm">読み込み中…</p>
      ) : (
        <SessionHost
          key={`${entry.key}#${session}`}
          entry={entry}
          played={played}
          combo={data.progress.combo}
          position={`${(index % catalog.length) + 1} / ${catalog.length}`}
          onNext={onNext}
        />
      )}
    </main>
  );
}

/** 1本のクリップの間だけ生きる。初回か再挑戦か、開始時のコンボは開いたときに決める。 */
function SessionHost({
  entry,
  played,
  combo,
  position,
  onNext,
}: {
  entry: CatalogEntry;
  played: boolean;
  combo: number;
  position: string;
  onNext: () => void;
}) {
  const [source] = useState<"feed" | "retry">(played ? "retry" : "feed");
  const [initialCombo] = useState(combo);

  const onAnswer = (item: Item, r: QuestionResult) => {
    getStore().update((d) => ({
      ...d,
      progress: { ...d.progress, combo: r.comboAfter },
      answers: [
        ...d.answers,
        {
          id: newId(),
          answeredAt: new Date().toISOString(),
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
          points: r.points,
        },
      ],
    }));
  };

  const onFinish = (s: QuizSummary) => {
    getStore().update((d) => ({
      ...d,
      clipResults: [
        ...d.clipResults,
        {
          id: newId(),
          finishedAt: new Date().toISOString(),
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
    }));
  };

  return (
    <>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        クリップ {position}
        {source === "retry" && "・再挑戦（XP 半分）"}
      </p>
      <ClipSession
        pack={entry.pack}
        clip={entry.clip}
        initialCombo={initialCombo}
        retry={source === "retry"}
        onAnswer={onAnswer}
        onFinish={onFinish}
        onNext={onNext}
      />
    </>
  );
}
