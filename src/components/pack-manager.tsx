"use client";
/**
 * パックの読み込み（M1 は貼り付けだけの簡易版）と一覧・削除。
 * ファイル読み込み・行番号つきエラー・置き換えの確認は M6。
 */
import { useState } from "react";
import { parsePackJson, type PackIssue } from "@/lib/domain/pack";
import { removePack, upsertPack } from "@/lib/domain/records";
import { SAMPLE_PACK } from "@/lib/sample";
import { getStore, useAppData } from "@/lib/store/use-app-data";

export function PackManager() {
  const data = useAppData();
  const [json, setJson] = useState("");
  const [errors, setErrors] = useState<PackIssue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => {
    setMessage(null);
    const others = new Set(
      data.packs.flatMap((p) =>
        p.pack.clips.flatMap((c) => c.items.map((i) => i.itemId)),
      ),
    );
    const r = parsePackJson(json);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    // 同じ packId の古い版は置き換えるので、重複の警告から外す
    const old = data.packs.find((p) => p.pack.packId === r.pack.packId);
    old?.pack.clips.forEach((c) => c.items.forEach((i) => others.delete(i.itemId)));
    const warnings = r.pack.clips
      .flatMap((c) => c.items)
      .filter((i) => others.has(i.itemId));
    getStore().update((d) => upsertPack(d, r.pack, new Date().toISOString()));
    setErrors([]);
    setJson("");
    const clips = r.pack.clips.length;
    const items = r.pack.clips.reduce((n, c) => n + c.items.length, 0);
    setMessage(
      `「${r.pack.title}」を${old ? "置き換えました" : "読み込みました"}（${clips} 本・${items} 問）` +
        (warnings.length
          ? `。注意：ほかのパックと同じ itemId が ${warnings.length} 個あります`
          : ""),
    );
  };

  const del = (packId: string) => {
    if (confirmDelete !== packId) {
      setConfirmDelete(packId);
      return;
    }
    getStore().update((d) => removePack(d, packId));
    setConfirmDelete(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">パックを貼り付けて読み込む</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          パックはこの端末のブラウザの中にだけ保存されます。
        </p>
        <textarea
          className="h-48 w-full rounded-xl border border-zinc-300 bg-transparent p-3 font-mono text-base dark:border-zinc-600"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{ "schemaVersion": 1, "packId": ... }'
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="パックの JSON"
        />
        <button
          className="h-12 w-full rounded-xl bg-sky-600 text-base font-semibold text-white disabled:opacity-40"
          onClick={load}
          disabled={!json.trim()}
        >
          読み込む
        </button>
        {message && (
          <p role="status" className="rounded-xl bg-emerald-100 p-3 text-sm dark:bg-emerald-900">
            {message}
          </p>
        )}
        {errors.length > 0 && (
          <div role="alert" className="flex flex-col gap-1 rounded-xl bg-rose-100 p-3 text-sm dark:bg-rose-900">
            <p className="font-bold">読み込めませんでした（{errors.length} 件）</p>
            <ul className="flex flex-col gap-1">
              {errors.slice(0, 30).map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-xs">{e.path}</span>：{e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">読み込んだパック</h2>
        {data.packs.length === 0 && (
          <p className="text-sm">まだありません。</p>
        )}
        {data.packs.map(({ pack, importedAt }) => (
          <div
            key={pack.packId}
            className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
          >
            <div className="flex-1 text-sm">
              <div className="font-bold">{pack.title}</div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {pack.packId}・版 {pack.version}・{pack.clips.length} 本・
                {new Date(importedAt).toLocaleString("ja-JP")}
              </div>
            </div>
            <button
              className={`h-12 rounded-xl px-3 text-sm ${confirmDelete === pack.packId ? "bg-rose-600 text-white" : "border border-zinc-300 dark:border-zinc-600"}`}
              onClick={() => del(pack.packId)}
            >
              {confirmDelete === pack.packId ? "本当に削除" : "削除"}
            </button>
          </div>
        ))}
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          サンプル：{SAMPLE_PACK.title}（{SAMPLE_PACK.clips.length} 本・削除できません）
        </p>
      </section>
    </div>
  );
}
