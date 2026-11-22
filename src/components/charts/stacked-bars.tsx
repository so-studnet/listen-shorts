"use client";
/**
 * 横棒（0〜100%）。1本の中を「正解」（色1）と「惜しい」（色2）に分け、2px のすきまで区切る。
 * 値は棒の外（右）に書く。指で触ると内訳を出す。
 */
import { useState } from "react";

export type BarRow = {
  label: string;
  /** 0〜1 */
  correct: number;
  /** 0〜1 */
  close: number;
  /** 右に書く値（例：62%） */
  value: string;
  /** 内訳（例：13問中 8問正解・惜しい 2問） */
  detail: string;
  empty: boolean;
};

export function StackedBars({ rows }: { rows: BarRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 text-xs" aria-hidden>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-[var(--viz-series-1)]" />
          正解
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-[var(--viz-series-2)]" />
          惜しい
        </span>
      </div>
      {rows.map((r, i) => (
        <button
          key={r.label}
          type="button"
          className="flex min-h-12 w-full items-center gap-2 text-left"
          onClick={() => setActive(i)}
          onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          aria-label={`${r.label}：${r.detail}`}
        >
          <span className="w-12 shrink-0 text-sm">{r.label}</span>
          <span className="flex h-6 flex-1 items-stretch gap-[2px]">
            {r.correct > 0 && (
              <span
                className={`bg-[var(--viz-series-1)] ${r.close > 0 ? "" : "rounded-r-[4px]"}`}
                style={{ width: `${r.correct * 100}%` }}
              />
            )}
            {r.close > 0 && (
              <span
                className="rounded-r-[4px] bg-[var(--viz-series-2)]"
                style={{ width: `${r.close * 100}%` }}
              />
            )}
            {r.empty && (
              <span className="self-center text-xs text-zinc-500">解答なし</span>
            )}
          </span>
          <span className="w-12 shrink-0 text-right text-sm font-semibold">
            {r.value}
          </span>
          {active === i && (
            <span role="tooltip" className="sr-only">
              {r.detail}
            </span>
          )}
        </button>
      ))}
      {active !== null && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400" data-testid="bar-detail">
          {rows[active].label}：{rows[active].detail}
        </p>
      )}
    </div>
  );
}
