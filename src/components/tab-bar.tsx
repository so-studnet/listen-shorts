"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "フィード", icon: "🎬" },
  { href: "/review", label: "復習", icon: "🔁" },
  { href: "/stats", label: "記録", icon: "📈" },
  { href: "/settings", label: "設定", icon: "⚙️" },
] as const;

export function TabBar() {
  const pathname = usePathname();
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
                <span className="text-lg leading-none" aria-hidden>
                  {t.icon}
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
