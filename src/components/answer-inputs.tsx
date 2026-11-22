"use client";
/** 3形式の解答欄。答えが決まったら onSubmit(input) を呼ぶ。 */
import { useState } from "react";
import { hintFor } from "@/lib/domain/text";
import { primaryBtn, secondaryBtn } from "./ui";

export function ClozeInput({
  answer,
  words,
  hintUsed,
  onHint,
  onSubmit,
}: {
  answer: string;
  words: number;
  hintUsed: boolean;
  onHint: () => void;
  onSubmit: (input: string) => void;
}) {
  const [input, setInput] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim()) onSubmit(input);
      }}
    >
      {hintUsed && (
        <p
          className="rounded-xl bg-amber-100 p-3 font-mono text-base dark:bg-amber-900"
          data-testid="hint"
        >
          ヒント：{hintFor(answer)}
        </p>
      )}
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
        placeholder={`${words} 語`}
      />
      <button type="submit" className={primaryBtn} disabled={!input.trim()}>
        答える
      </button>
      {!hintUsed && (
        <button type="button" className={secondaryBtn} onClick={onHint}>
          💡 ヒント（最初の1文字・得点半分）
        </button>
      )}
    </form>
  );
}

export function ChoiceInput({
  options,
  onSubmit,
}: {
  options: string[];
  onSubmit: (input: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="選択肢">
      {options.map((o) => (
        <button
          key={o}
          className="h-14 rounded-xl border-2 border-sky-600 text-lg font-semibold active:bg-sky-100 dark:active:bg-sky-900"
          onClick={() => onSubmit(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function OrderInput({
  cards,
  onSubmit,
}: {
  cards: string[];
  onSubmit: (input: string) => void;
}) {
  // 並べたカードの番号（cards の index）
  const [placed, setPlaced] = useState<number[]>([]);
  const remaining = cards.map((_, i) => i).filter((i) => !placed.includes(i));
  const done = placed.length === cards.length;
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex min-h-14 flex-wrap gap-2 rounded-xl border-2 border-dashed border-zinc-300 p-2 dark:border-zinc-600"
        aria-label="並べた語"
        data-testid="order-placed"
      >
        {placed.length === 0 && (
          <span className="self-center px-1 text-sm text-zinc-500">
            聞こえた順にタップ
          </span>
        )}
        {placed.map((i) => (
          <button
            key={i}
            className="h-11 rounded-lg bg-sky-600 px-3 text-base text-white"
            onClick={() => setPlaced(placed.filter((p) => p !== i))}
          >
            {cards[i]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="語のカード">
        {remaining.map((i) => (
          <button
            key={i}
            className="h-11 rounded-lg border border-zinc-300 px-3 text-base dark:border-zinc-600"
            onClick={() => setPlaced([...placed, i])}
          >
            {cards[i]}
          </button>
        ))}
      </div>
      <button
        className={primaryBtn}
        disabled={!done}
        onClick={() => onSubmit(placed.map((i) => cards[i]).join(" "))}
      >
        答える
      </button>
      {placed.length > 0 && (
        <button className={secondaryBtn} onClick={() => setPlaced([])}>
          並べ直す
        </button>
      )}
    </div>
  );
}
