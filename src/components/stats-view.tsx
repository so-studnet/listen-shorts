"use client";
/** 記録の画面。M3：レベル・XP・バッジ。正答率の推移は M5。 */
import { BADGES, buildBadgeContext } from "@/lib/domain/badges";
import { totalXp } from "@/lib/domain/records";
import { useAppData } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";
import { LevelBar } from "./level-bar";

export function StatsView() {
  const data = useAppData();
  const hydrated = useHydrated();
  if (!hydrated) return <p className="text-sm">読み込み中…</p>;

  const xp = totalXp(data);
  const ctx = buildBadgeContext(data);
  const earned = new Map(data.progress.badges.map((b) => [b.id, b.earnedAt]));
  const answered = data.answers.length;
  const correct = data.answers.filter((a) => a.verdict === "correct").length;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">
        <LevelBar xp={xp} />
        <div className="grid grid-cols-3 text-center text-sm">
          <div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">合計 XP</div>
            <div className="font-bold" data-testid="stats-xp">{xp}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">解いた本数</div>
            <div className="font-bold">{data.clipResults.length}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">正答率</div>
            <div className="font-bold">
              {answered ? `${Math.round((correct / answered) * 100)}%` : "—"}
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">
          バッジ（{earned.size} / {BADGES.length}）
        </h2>
        <ul className="flex flex-col gap-2">
          {BADGES.map((b) => {
            const at = earned.get(b.id);
            const [n, goal] = b.progress(ctx);
            return (
              <li
                key={b.id}
                data-testid={`badge-${b.id}`}
                data-earned={at ? "yes" : "no"}
                className={`flex items-center gap-3 rounded-xl border p-3 ${at ? "border-sky-300 dark:border-sky-700" : "border-zinc-200 dark:border-zinc-700"}`}
              >
                <span className={`text-2xl ${at ? "" : "opacity-30 grayscale"}`} aria-hidden>
                  {b.icon}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-bold">{b.name}</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {b.description}
                  </div>
                </div>
                <div className="text-right text-xs">
                  {at ? (
                    <>
                      獲得
                      <br />
                      {new Date(at).toLocaleDateString("ja-JP")}
                    </>
                  ) : goal > 1 ? (
                    `${n} / ${goal}`
                  ) : (
                    "未獲得"
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
