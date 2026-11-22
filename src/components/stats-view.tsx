"use client";
/** 記録の画面：レベル・正答率の推移（週・タグ）・アクセント別・バッジ。 */
import { useState } from "react";
import { BADGES, buildBadgeContext } from "@/lib/domain/badges";
import { totalXp } from "@/lib/domain/records";
import {
  TAG_LABEL,
  byAccent,
  byTag,
  overall,
  rate,
  weekly,
  type Tally,
  type WeekTally,
} from "@/lib/domain/stats";
import { useAppData } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";
import { LineChart, type LinePoint } from "./charts/line-chart";
import { StackedBars } from "./charts/stacked-bars";
import { LevelBar } from "./level-bar";

/** 推移を出す週の数。 */
const WEEKS = 8;

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const detail = (t: Tally) =>
  t.total === 0
    ? "解答なし"
    : `${t.total}問中 ${t.correct}問正解${t.close ? `・惜しい ${t.close}問` : ""}`;
const toPoints = (weeks: WeekTally[]): LinePoint[] =>
  weeks.map((w) => ({ label: md(w.start), value: rate(w), detail: detail(w) }));

export function StatsView() {
  const hydrated = useHydrated();
  if (!hydrated) return <p className="text-sm">読み込み中…</p>;
  return <Stats />;
}

function Stats() {
  const data = useAppData();
  // 画面を開いた時刻で週を区切る
  const [now] = useState(() => new Date());
  const xp = totalXp(data);
  const all = overall(data.answers);
  const weeks = weekly(data.answers, now, WEEKS);
  const tags = byTag(data.answers, now, WEEKS);
  const accents = byAccent(data.answers);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">
        <LevelBar xp={xp} />
        <div className="grid grid-cols-3 text-center text-sm">
          <Figure label="合計 XP" value={String(xp)} testId="stats-xp" />
          <Figure label="解いた本数" value={String(data.clipResults.length)} />
          <Figure label="正答率" value={pct(rate(all))} testId="stats-rate" />
        </div>
      </section>

      {all.total === 0 ? (
        <p className="text-sm">
          まだ解答がありません。フィードでクリップを解くと、ここに正答率の推移が出ます。
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2" data-testid="weekly">
            <h2 className="text-sm font-bold">正答率の推移（週ごと）</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              直近 {WEEKS} 週。週は月曜の朝4時から。点に触ると内訳が出ます
            </p>
            <LineChart points={toPoints(weeks)} label="週ごとの正答率" />
            <TableView
              head={["週", "正答率", "解答", "正解", "惜しい"]}
              rows={weeks.map((w) => [
                `${md(w.start)}〜`,
                pct(rate(w)),
                String(w.total),
                String(w.correct),
                String(w.close),
              ])}
            />
          </section>

          <section className="flex flex-col gap-2" data-testid="by-tag">
            <h2 className="text-sm font-bold">誤りの種類ごとの正答率</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              右上は全期間。線は直近 {WEEKS} 週の推移
            </p>
            <div className="grid grid-cols-2 gap-3">
              {tags.map((t) => (
                <div
                  key={t.tag}
                  className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-2 dark:border-zinc-700"
                  data-testid={`tag-${t.tag}`}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-xs font-bold">{TAG_LABEL[t.tag]}</span>
                    <span className="text-sm font-semibold">{pct(rate(t.all))}</span>
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    {t.all.total}問
                  </div>
                  {t.all.total > 0 ? (
                    <LineChart
                      points={toPoints(t.weeks)}
                      height={72}
                      compact
                      label={`${TAG_LABEL[t.tag]}の週ごとの正答率`}
                    />
                  ) : (
                    <div className="flex h-[72px] items-center justify-center text-xs text-zinc-500">
                      解答なし
                    </div>
                  )}
                </div>
              ))}
            </div>
            <TableView
              head={["種類", "正答率", "解答", "正解", "惜しい"]}
              rows={tags.map((t) => [
                TAG_LABEL[t.tag],
                pct(rate(t.all)),
                String(t.all.total),
                String(t.all.correct),
                String(t.all.close),
              ])}
            />
          </section>

          <section className="flex flex-col gap-2" data-testid="by-accent">
            <h2 className="text-sm font-bold">アクセント別の正答率</h2>
            <StackedBars
              rows={accents.map((a) => ({
                label: a.accent,
                correct: a.all.total ? a.all.correct / a.all.total : 0,
                close: a.all.total ? a.all.close / a.all.total : 0,
                value: pct(rate(a.all)),
                detail: detail(a.all),
                empty: a.all.total === 0,
              }))}
            />
          </section>
        </>
      )}

      <Badges />
    </div>
  );
}

function Figure({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div>
      <div className="text-xs text-zinc-600 dark:text-zinc-400">{label}</div>
      <div className="font-bold" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function TableView({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details className="text-sm">
      <summary className="flex h-12 cursor-pointer items-center text-xs text-zinc-600 dark:text-zinc-400">
        表で見る
      </summary>
      <table className="w-full text-right text-xs">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            {head.map((h, i) => (
              <th key={h} className={`py-1 font-semibold ${i === 0 ? "text-left" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-zinc-100 dark:border-zinc-800">
              {r.map((c, i) => (
                <td key={i} className={`py-1 ${i === 0 ? "text-left" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Badges() {
  const data = useAppData();
  const ctx = buildBadgeContext(data);
  const earned = new Map(data.progress.badges.map((b) => [b.id, b.earnedAt]));
  return (
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
  );
}
