"use client";
/** 設定の「アカウント」：ログイン中のメールアドレス、同期の状態、読み直し、ログアウト。 */
import { useState } from "react";
import type { SyncStatus } from "@/lib/store/app-store";
import { useSyncStatus } from "@/lib/store/use-app-data";
import { retrySync, signOut } from "@/lib/supabase/auth";
import { useAuth } from "@/lib/supabase/use-auth";
import { secondaryBtn } from "./ui";

const STATUS_LABEL: Record<SyncStatus, string> = {
  local: "この端末だけに保存",
  loading: "読み込み中…",
  synced: "✅ 同期済み",
  saving: "保存中…",
  error: "⚠️ 同期エラー",
  offline: "📴 オフライン",
};

export function AccountSection() {
  const auth = useAuth();
  const status = useSyncStatus();
  const [confirm, setConfirm] = useState(false);
  if (auth.status !== "signed-in")
    return (
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">アカウント</h2>
        <p className="text-sm" data-testid="account-status">
          ログインなし（{STATUS_LABEL.local}）
        </p>
      </section>
    );
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">アカウント</h2>
      <p className="text-sm">
        {auth.email} でログイン中
        <br />
        <span data-testid="account-status">{STATUS_LABEL[status]}</span>
      </p>
      <button className={secondaryBtn} onClick={retrySync}>
        🔄 サーバーから読み直す
      </button>
      <button
        className={`h-12 w-full rounded-xl px-4 text-base font-semibold ${confirm ? "bg-rose-600 text-white" : "border border-zinc-300 dark:border-zinc-600"}`}
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          void signOut();
        }}
      >
        {confirm ? "本当にログアウト" : "ログアウト"}
      </button>
    </section>
  );
}
