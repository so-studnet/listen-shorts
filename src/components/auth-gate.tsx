"use client";
/**
 * ログインの関所。Supabase が設定されていれば、ログインするまでアプリを見せない。
 * 設定されていなければ（開発中など）ブラウザ内保存のまま動く。
 */
import { useState } from "react";
import { hasLocalData, mergeAppData } from "@/lib/sync/rows";
import { getRemoteStore, retrySync, signIn } from "@/lib/supabase/auth";
import { useAuth } from "@/lib/supabase/use-auth";
import { getLocalStore, getStore, useSyncStatus } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";
import { primaryBtn, secondaryBtn } from "./ui";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.status === "local") return <>{children}</>;
  if (auth.status === "loading")
    return (
      <main className="flex flex-1 items-center justify-center text-sm">読み込み中…</main>
    );
  if (auth.status === "signed-out") return <LoginScreen />;
  return (
    <>
      <SyncBanner />
      <ImportBanner userId={auth.userId} />
      {children}
    </>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6">
      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(await signIn(email, password));
          setBusy(false);
        }}
      >
        <h1 className="text-center text-2xl font-bold">ListenShorts</h1>
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          ログインしてください
        </p>
        <label className="flex flex-col gap-1 text-sm">
          メールアドレス
          <input
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            required
            className="h-12 rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-600"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          パスワード
          <input
            type="password"
            autoComplete="current-password"
            required
            className="h-12 rounded-xl border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-600"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? "ログイン中…" : "ログイン"}
        </button>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-100 p-3 text-sm dark:bg-rose-900">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}

/** 同期できないときだけ出す帯。 */
function SyncBanner() {
  const status = useSyncStatus();
  if (status !== "error" && status !== "offline") return null;
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 bg-rose-100 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm dark:bg-rose-900"
    >
      <span className="flex-1">
        {status === "offline"
          ? "オフラインです。いまの解答は保存されません"
          : "同期できませんでした。直前の変更は保存されていない可能性があります"}
      </span>
      <button className="h-10 rounded-lg border border-rose-400 px-3" onClick={retrySync}>
        読み直す
      </button>
    </div>
  );
}

const askedKey = (userId: string) => `listen-shorts:v1:import-asked:${userId}`;

/** ログイン後に一度だけ、このブラウザの記録を取り込むか聞く。サーバーの読み込みが終わってから出す。 */
function ImportBanner({ userId }: { userId: string }) {
  const hydrated = useHydrated();
  const status = useSyncStatus();
  const [done, setDone] = useState(false);
  if (!hydrated || done) return null;
  const remote = getRemoteStore();
  if (!remote?.isLoaded() || status === "loading") return null;
  let asked = false;
  try {
    asked = window.localStorage.getItem(askedKey(userId)) === "yes";
  } catch {
    // 読めなければ聞く
  }
  if (asked) return null;
  const local = getLocalStore().getSnapshot();
  if (!hasLocalData(local)) return null;

  const finish = (merge: boolean) => {
    if (merge) getStore().update((d) => mergeAppData(d, local));
    try {
      window.localStorage.setItem(askedKey(userId), "yes");
    } catch {
      // 保存できなくても、この画面では閉じる
    }
    setDone(true);
  };

  return (
    <div
      role="dialog"
      aria-label="このブラウザの記録の取り込み"
      className="flex shrink-0 flex-col gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-sm dark:border-amber-800 dark:bg-amber-950"
    >
      <p>
        このブラウザに、ログイン前の記録があります（解答 {local.answers.length} 件・パック{" "}
        {local.packs.length} 個・復習 {local.review.length} 問）。アカウントに取り込みますか？
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button className={primaryBtn} onClick={() => finish(true)}>
          取り込む
        </button>
        <button className={secondaryBtn} onClick={() => finish(false)}>
          取り込まない
        </button>
      </div>
    </div>
  );
}
