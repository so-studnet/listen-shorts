import { levelFromXp } from "@/lib/domain/level";

/** レベル・称号・次のレベルまでの XP のバー。 */
export function LevelBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const lv = levelFromXp(xp);
  const pct = Math.round((lv.xpInLevel / lv.xpForNext) * 100);
  return (
    <div className="flex flex-col gap-1" data-testid="level-bar">
      <div className="flex items-baseline justify-between gap-2">
        <span className={compact ? "text-sm font-bold" : "text-lg font-bold"}>
          Lv {lv.level}
          <span className="ml-2 font-normal">{lv.title}</span>
        </span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {lv.xpInLevel} / {lv.xpForNext} XP
        </span>
      </div>
      <div
        className={`overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700 ${compact ? "h-1.5" : "h-2.5"}`}
        role="progressbar"
        aria-label="次のレベルまで"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
