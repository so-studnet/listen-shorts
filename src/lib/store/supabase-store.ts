/**
 * Supabase に保存するストア。
 * - 画面はすぐ更新し（楽観的更新）、差分を順番にサーバーへ送る
 * - 別の端末の変更は Realtime で受け取り、読み直す。画面に戻ったとき・通信が戻ったときも読み直す
 * - 保存に失敗したらサーバーから読み直して正しい状態に戻す（オフラインでの記録はできない）
 * - 起動を速くするため、最後に読んだデータを localStorage にも置く（ユーザーごと）
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_DATA, loadAppData, type AppData } from "@/lib/domain/records";
import {
  diffAppData,
  isEmptyDiff,
  rowsToAppData,
  type AnswerRow,
  type AppDataDiff,
  type ClipResultRow,
  type PackRow,
  type ProgressRow,
  type ReviewRow,
} from "@/lib/sync/rows";
import type { AppStore, SyncStatus } from "./app-store";

const PAGE_SIZE = 1000;
const UPSERT_CHUNK = 500;
const DELETE_CHUNK = 200;

export const TABLES = {
  packs: "ls_packs",
  answers: "ls_answers",
  clipResults: "ls_clip_results",
  review: "ls_review_entries",
  progress: "ls_progress",
} as const;

const COLUMNS = {
  packs: "id, data, imported_at",
  answers:
    "id, session_id, answered_at, source, pack_id, clip_id, item_id, type, tags, accent, difficulty, input, verdict, replays, elapsed_ms, hint_used, speed_bonus, points",
  clipResults:
    "id, finished_at, pack_id, clip_id, source, total, correct, points, life_bonus, lives_left, max_combo",
  review: "id, pack_id, clip_id, item_id, stage, due_at, last_answered_at",
  progress: "combo, badges, feed_filter",
};

const chunks = <T>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export class SupabaseAppStore implements AppStore {
  private data: AppData = EMPTY_DATA;
  private status: SyncStatus = "loading";
  private loaded = false;
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private needsRefetch = false;
  private failed = false;
  private refetchTimer: ReturnType<typeof setTimeout> | undefined;
  private cleanups: (() => void)[] = [];

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly cache: Storage | null = typeof window === "undefined"
      ? null
      : window.localStorage,
  ) {
    const cached = this.readCache();
    if (cached) this.data = cached;
  }

  // ---- AppStore ----
  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    return () => {
      this.listeners.delete(onChange);
    };
  };
  getSnapshot = () => this.data;
  getServerSnapshot = () => EMPTY_DATA;
  getStatus = () => this.status;
  /** サーバーから一度でも読み込めたか（取り込みの案内はそれまで出さない） */
  isLoaded = () => this.loaded;

  update = (fn: (prev: AppData) => AppData) => {
    const prev = this.data;
    const next = fn(prev);
    if (next === prev) return;
    this.data = next;
    this.writeCache();
    this.pending += 1;
    this.status = "saving";
    this.notify();
    this.queue = this.queue
      .then(() => this.push(diffAppData(prev, next)))
      .catch((e: unknown) => {
        console.error("保存に失敗しました", e);
        this.failed = true;
      })
      .finally(() => {
        this.pending -= 1;
        if (this.pending > 0) return;
        if (this.failed) {
          this.failed = false;
          this.setStatus("error");
          void this.refetch({ keepErrorStatus: true });
        } else if (this.needsRefetch) {
          void this.refetch();
        } else {
          this.setStatus("synced");
        }
      });
  };

  /** 送信待ちの変更がすべて終わるまで待つ（テスト用） */
  whenIdle(): Promise<void> {
    return this.queue;
  }

  // ---- 起動・終了 ----
  start(): void {
    void this.refetch();
    const channel = this.client.channel(`listen-shorts-${this.userId}`);
    for (const table of Object.values(TABLES)) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${this.userId}` },
        () => this.scheduleRefetch(),
      );
    }
    channel.subscribe();
    this.cleanups.push(() => void this.client.removeChannel(channel));

    if (typeof window !== "undefined") {
      const onVisible = () => {
        if (document.visibilityState === "visible") this.scheduleRefetch(0);
      };
      const onOnline = () => this.scheduleRefetch(0);
      const onOffline = () => this.setStatus("offline");
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      this.cleanups.push(() => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      });
    }
  }

  stop(): void {
    clearTimeout(this.refetchTimer);
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }

  /** 失敗した後などに、手動でサーバーから読み直す */
  retry(): void {
    void this.refetch();
  }

  // ---- 読み込み ----
  private scheduleRefetch(delayMs = 300): void {
    clearTimeout(this.refetchTimer);
    this.refetchTimer = setTimeout(() => void this.refetch(), delayMs);
  }

  async refetch({ keepErrorStatus = false } = {}): Promise<void> {
    // 送信中の変更があるときに読み直すと、画面が一瞬古い状態に戻るので後回しにする
    if (this.pending > 0) {
      this.needsRefetch = true;
      return;
    }
    this.needsRefetch = false;
    if (!this.loaded && !keepErrorStatus) this.setStatus("loading");
    try {
      const [packs, answers, clipResults, review, progress] = await Promise.all([
        this.fetchAll<PackRow>(TABLES.packs, COLUMNS.packs),
        this.fetchAll<AnswerRow>(TABLES.answers, COLUMNS.answers),
        this.fetchAll<ClipResultRow>(TABLES.clipResults, COLUMNS.clipResults),
        this.fetchAll<ReviewRow>(TABLES.review, COLUMNS.review),
        this.fetchProgress(),
      ]);
      // 読み込み中に画面で変更があったら、この結果は捨てて送信後に読み直す
      if (this.pending > 0) {
        this.needsRefetch = true;
        return;
      }
      this.data = rowsToAppData({ packs, answers, clipResults, review, progress });
      this.loaded = true;
      this.writeCache();
      this.status = keepErrorStatus ? "error" : "synced";
      this.notify();
    } catch (e) {
      console.error("読み込みに失敗しました", e);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      this.setStatus(offline ? "offline" : "error");
    }
  }

  private async fetchAll<R>(table: string, columns: string): Promise<R[]> {
    const rows: R[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.client
        .from(table)
        .select(columns)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as R[]));
      if (!data || data.length < PAGE_SIZE) return rows;
    }
  }

  private async fetchProgress(): Promise<ProgressRow | null> {
    const { data, error } = await this.client
      .from(TABLES.progress)
      .select(COLUMNS.progress)
      .maybeSingle();
    if (error) throw error;
    return (data as ProgressRow | null) ?? null;
  }

  // ---- 送信 ----
  private async push(diff: AppDataDiff): Promise<void> {
    if (isEmptyDiff(diff)) return;
    const withUser = <R>(rows: R[]) => rows.map((r) => ({ ...r, user_id: this.userId }));
    const upsert = async (table: string, rows: object[]) => {
      for (const part of chunks(rows, UPSERT_CHUNK))
        await this.run(this.client.from(table).upsert(withUser(part), { onConflict: "user_id,id" }));
    };
    const remove = async (table: string, ids: string[]) => {
      for (const part of chunks(ids, DELETE_CHUNK))
        await this.run(this.client.from(table).delete().in("id", part));
    };
    // 追加・更新を先に、削除を後に
    await upsert(TABLES.packs, diff.packs.upserts);
    await upsert(TABLES.answers, diff.answers.upserts);
    await upsert(TABLES.clipResults, diff.clipResults.upserts);
    await upsert(TABLES.review, diff.review.upserts);
    if (diff.progress)
      await this.run(
        this.client
          .from(TABLES.progress)
          .upsert({ ...diff.progress, user_id: this.userId }, { onConflict: "user_id" }),
      );
    await remove(TABLES.review, diff.review.deletes);
    await remove(TABLES.answers, diff.answers.deletes);
    await remove(TABLES.clipResults, diff.clipResults.deletes);
    await remove(TABLES.packs, diff.packs.deletes);
  }

  private async run(query: PromiseLike<{ error: unknown }>): Promise<void> {
    const { error } = await query;
    if (error) throw error;
  }

  // ---- その他 ----
  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.notify();
  }

  private cacheKey(): string {
    return `listen-shorts:v1:cache:${this.userId}`;
  }

  private readCache(): AppData | null {
    try {
      const raw = this.cache?.getItem(this.cacheKey());
      return raw ? loadAppData(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private writeCache(): void {
    try {
      this.cache?.setItem(this.cacheKey(), JSON.stringify(this.data));
    } catch {
      // 容量不足などは無視する（次回の起動が少し遅くなるだけ）
    }
  }

  /** ログアウト時に、この端末に残したキャッシュを消す */
  clearCache(): void {
    try {
      this.cache?.removeItem(this.cacheKey());
    } catch {
      // 消せなくてもよい
    }
  }
}
