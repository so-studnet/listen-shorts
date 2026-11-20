"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildCatalog } from "@/lib/domain/catalog";
import type { Item } from "@/lib/domain/pack";
import { summarize, type QuestionResult } from "@/lib/domain/quiz";
import { newId } from "@/lib/id";
import { SAMPLE_PACK } from "@/lib/sample";
import { getStore, useAppData } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";
import { ClipSession } from "./clip-session";
import type { CatalogEntry } from "@/lib/domain/catalog";

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

  const totalPoints = data.answers.reduce((sum, a) => sum + a.points, 0);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <nav className="flex items-center justify-between">
        <h1 className="text-lg font-bold">ListenShorts</h1>
        <div className="flex items-center gap-3 text-sm">
          <span data-testid="total-points">{totalPoints} XP</span>
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
        position={`${(index % catalog.length) + 1} / ${catalog.length}`}
        onNext={onNext}
      />
      )}
    </main>
  );
}

/** 1本のクリップの間だけ生きる。初回か再挑戦かは開いたときに決める。 */
function SessionHost({
  entry,
  played,
  position,
  onNext,
}: {
  entry: CatalogEntry;
  played: boolean;
  position: string;
  onNext: () => void;
}) {
  const [source] = useState<"feed" | "retry">(played ? "retry" : "feed");


  const onAnswer = (item: Item, r: QuestionResult) => {
    getStore().update((d) => ({
      ...d,
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
          hintUsed: false,
          points: r.points,
        },
      ],
    }));
  };

  const onFinish = (results: QuestionResult[]) => {
    const s = summarize(results);
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
          livesLeft: 0,
          maxCombo: 0,
        },
      ],
    }));
  };

  return (
    <>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        クリップ {position}
        {source === "retry" && "・再挑戦"}
      </p>
      <ClipSession
        pack={entry.pack}
        clip={entry.clip}
        onAnswer={onAnswer}
        onFinish={onFinish}
        onNext={onNext}
      />
    </>
  );
}
