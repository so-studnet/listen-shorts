import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { EMPTY_DATA, type AnswerLog } from "@/lib/domain/records";
import { SupabaseAppStore, TABLES } from "./supabase-store";

type Row = Record<string, unknown> & { id?: string };

/** テスト用の最小限の Supabase クライアント（メモリ上のテーブル） */
function fakeClient(initial: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.values(TABLES).map((t) => [t, [...(initial[t] ?? [])]]),
  );
  const ops: string[] = [];
  let failNext = false;
  const result = <T>(fn: () => T) =>
    new Promise<{ data: T | null; error: unknown }>((resolve) =>
      setTimeout(() => {
        if (failNext) {
          failNext = false;
          resolve({ data: null, error: new Error("network") });
          return;
        }
        resolve({ data: fn(), error: null });
      }, 1),
    );
  const key = (table: string, r: Row) => (table === TABLES.progress ? "me" : String(r.id));
  const client = {
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          range: (from: number, to: number) =>
            result(() =>
              [...tables[table]].sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(from, to + 1),
            ),
        }),
        maybeSingle: () => result(() => tables[table][0] ?? null),
      }),
      upsert: (rows: Row | Row[], opts: { onConflict: string }) => {
        const list = Array.isArray(rows) ? rows : [rows];
        ops.push(`upsert ${table} ${list.map((r) => key(table, r)).join(",")} (${opts.onConflict})`);
        return result(() => {
          for (const r of list) {
            if (r.user_id !== "u1") throw new Error("user_id がない");
            tables[table] = [...tables[table].filter((x) => key(table, x) !== key(table, r)), r];
          }
          return null;
        });
      },
      delete: () => ({
        in: (_: string, ids: string[]) => {
          ops.push(`delete ${table} ${ids.join(",")}`);
          return result(() => {
            tables[table] = tables[table].filter((x) => !ids.includes(String(x.id)));
            return null;
          });
        },
      }),
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: async () => "ok",
  };
  return {
    client: client as unknown as SupabaseClient,
    tables,
    ops,
    failNextRequest: () => {
      failNext = true;
    },
  };
}

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
};

const answer = (id: string): AnswerLog => ({
  id,
  answeredAt: "2026-11-22T03:00:00.000Z",
  source: "feed",
  packId: "p",
  clipId: "c",
  itemId: `i-${id}`,
  type: "cloze",
  tags: ["l_r"],
  accent: "US",
  difficulty: 2,
  input: "x",
  verdict: "wrong",
  replays: 0,
  elapsedMs: 1000,
  hintUsed: false,
  speedBonus: 0,
  points: 0,
});

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe("SupabaseAppStore", () => {
  it("サーバーから読み込み、状態が loading → synced になる", async () => {
    const f = fakeClient({
      [TABLES.answers]: [
        {
          id: "a1",
          session_id: null,
          answered_at: "2026-11-22T03:00:00+00:00",
          source: "feed",
          pack_id: "p",
          clip_id: "c",
          item_id: "i",
          type: "cloze",
          tags: ["l_r"],
          accent: "US",
          difficulty: 2,
          input: "x",
          verdict: "correct",
          replays: 0,
          elapsed_ms: 1000,
          hint_used: false,
          speed_bonus: 20,
          points: 120,
        },
      ],
      [TABLES.progress]: [{ combo: 4, badges: [], feed_filter: { packId: null, accent: null, difficulty: null } }],
    });
    const store = new SupabaseAppStore(f.client, "u1", memoryStorage());
    expect(store.getStatus()).toBe("loading");
    await store.refetch();
    expect(store.getStatus()).toBe("synced");
    expect(store.isLoaded()).toBe(true);
    expect(store.getSnapshot().answers[0]).toMatchObject({ id: "a1", answeredAt: "2026-11-22T03:00:00.000Z", points: 120 });
    expect(store.getSnapshot().progress.combo).toBe(4);
  });

  it("変更はすぐ画面に出て、差分だけを user_id つきで送る", async () => {
    const f = fakeClient();
    const store = new SupabaseAppStore(f.client, "u1", memoryStorage());
    await store.refetch();
    store.update((d) => ({ ...d, answers: [answer("a1")], progress: { ...d.progress, combo: 1 } }));
    expect(store.getSnapshot().answers).toHaveLength(1);
    expect(store.getStatus()).toBe("saving");
    store.update((d) => ({ ...d, answers: [...d.answers, answer("a2")] }));
    await store.whenIdle();
    await wait();
    expect(f.ops).toEqual([
      `upsert ${TABLES.answers} a1 (user_id,id)`,
      `upsert ${TABLES.progress} me (user_id)`,
      `upsert ${TABLES.answers} a2 (user_id,id)`,
    ]);
    expect(store.getStatus()).toBe("synced");
    expect(f.tables[TABLES.answers].map((r) => r.id)).toEqual(["a1", "a2"]);
  });

  it("多いときは分けて送る（すべて削除も）", async () => {
    const f = fakeClient();
    const store = new SupabaseAppStore(f.client, "u1", memoryStorage());
    await store.refetch();
    const many = Array.from({ length: 1201 }, (_, i) => answer(`a${String(i).padStart(4, "0")}`));
    store.update((d) => ({ ...d, answers: many }));
    await store.whenIdle();
    expect(f.ops.filter((o) => o.startsWith(`upsert ${TABLES.answers}`))).toHaveLength(3);
    expect(f.tables[TABLES.answers]).toHaveLength(1201);
    f.ops.length = 0;
    store.update(() => EMPTY_DATA);
    await store.whenIdle();
    expect(f.ops.filter((o) => o.startsWith(`delete ${TABLES.answers}`))).toHaveLength(7);
    expect(f.tables[TABLES.answers]).toHaveLength(0);
  });

  it("保存に失敗したら、サーバーから読み直して正しい状態に戻し、エラーを出す", async () => {
    const f = fakeClient();
    const store = new SupabaseAppStore(f.client, "u1", memoryStorage());
    await store.refetch();
    f.failNextRequest();
    store.update((d) => ({ ...d, answers: [answer("a1")] }));
    await store.whenIdle();
    await wait(30);
    expect(store.getStatus()).toBe("error");
    expect(store.getSnapshot().answers).toEqual([]);
    // 手動で読み直すと戻る
    store.retry();
    await wait(30);
    expect(store.getStatus()).toBe("synced");
  });

  it("送信中は読み直しを後回しにし、送信後に読み直す", async () => {
    const f = fakeClient();
    const store = new SupabaseAppStore(f.client, "u1", memoryStorage());
    await store.refetch();
    store.update((d) => ({ ...d, answers: [answer("a1")] }));
    await store.refetch(); // 送信中なので後回し
    expect(store.getSnapshot().answers).toHaveLength(1);
    await store.whenIdle();
    await wait(30);
    expect(store.getSnapshot().answers.map((a) => a.id)).toEqual(["a1"]);
    expect(store.getStatus()).toBe("synced");
  });

  it("最後に読んだデータをユーザーごとにキャッシュし、次の起動ですぐ出す。ログアウトで消す", async () => {
    const storage = memoryStorage();
    const f = fakeClient();
    const s1 = new SupabaseAppStore(f.client, "u1", storage);
    await s1.refetch();
    s1.update((d) => ({ ...d, answers: [answer("a1")] }));
    await s1.whenIdle();
    const s2 = new SupabaseAppStore(f.client, "u1", storage);
    expect(s2.getSnapshot().answers).toHaveLength(1);
    expect(new SupabaseAppStore(f.client, "u2", storage).getSnapshot()).toEqual(EMPTY_DATA);
    s2.clearCache();
    expect(new SupabaseAppStore(f.client, "u1", storage).getSnapshot()).toEqual(EMPTY_DATA);
  });
});

