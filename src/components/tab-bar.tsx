"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { dueEntries } from "@/lib/domain/review";
import { useAppData } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";

const TABS = [
  { href: "/", label: "フィード", icon: "🎬" },
  { href: "/review", label: "復習", icon: "🔁" },
  { href: "/stats", label: "記録", icon: "📈" },
  { href: "/settings", label: "設定", icon: "⚙️" },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  return (
    <nav
      aria-label="タブ"
      className="shrink-0 border-t border-zinc-200 bg-[var(--background)] pb-[env(safe-area-inset-bottom)] dark:border-zinc-800"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? "font-bold text-sky-600 dark:text-sky-400" : "text-zinc-600 dark:text-zinc-400"}`}
              >
                <span className="relative text-lg leading-none" aria-hidden>
                  {t.icon}
                  {t.href === "/review" && hydrated && <DueBadge />}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 復習タブの、今日の件数。ブラウザでだけ描画する（時刻を使うため）。 */
function DueBadge() {
  const data = useAppData();
  // 開いた時刻で数える（日付が変わったら、アプリを開き直したときに増える）
  const [openedAt] = useState(() => new Date());
  const due = dueEntries(data.review, openedAt).length;
  if (due === 0) return null;
  return (
    <span
      className="absolute -top-1.5 -right-3 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] leading-5 font-bold text-white"
      data-testid="due-badge"
    >
      {due}
    </span>
  );
}
