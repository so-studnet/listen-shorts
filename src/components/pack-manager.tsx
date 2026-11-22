"use client";
/**
 * 設定の画面：パックの読み込み（ファイル・貼り付け）と一覧・削除、データの書き出しと全削除。
 * 仕様は docs/requirements.md の F7 と F6「設定」。
 */
import { useRef, useState } from "react";
import { parsePackJson, type Pack, type PackIssue } from "@/lib/domain/pack";
import {
  EMPTY_DATA,
  packUpdateKind,
  parseBackup,
  removePack,
  upsertPack,
  type AppData,
} from "@/lib/domain/records";
import { SAMPLE_PACK } from "@/lib/sample";
import { getStore, useAppData, useSyncStatus } from "@/lib/store/use-app-data";
import { useHydrated } from "@/lib/use-hydrated";
import { InstallGuide } from "./install-guide";
import { primaryBtn, secondaryBtn } from "./ui";

type Pending = { pack: Pack; warnings: PackIssue[]; oldVersion: number };

const countItems = (p: Pack) => p.clips.reduce((n, c) => n + c.items.length, 0);

export function PackManager() {
  const hydrated = useHydrated();
  if (!hydrated) return <p className="text-sm">読み込み中…</p>;
  return <Manager />;
}

function Manager() {
  const data = useAppData();
  const local = useSyncStatus() === "local";
  const [json, setJson] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errors, setErrors] = useState<PackIssue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = (pack: Pack, warnings: PackIssue[], replaced: string | null) => {
    getStore().update((d) => upsertPack(d, pack, new Date().toISOString()));
    setErrors([]);
    setPending(null);
    setJson("");
    setFileName(null);
    setMessage(
      `「${pack.title}」を${replaced ?? "読み込みました"}（${pack.clips.length} 本・${countItems(pack)} 問）` +
        (warnings.length
          ? `。注意：ほかのパックと同じ itemId が ${warnings.length} 個あります（${warnings
              .slice(0, 3)
              .map((w) => (w.line ? `${w.line}行目` : w.path))
              .join("、")}${warnings.length > 3 ? " ほか" : ""}）`
          : ""),
    );
  };

  const load = (text: string) => {
    setMessage(null);
    setPending(null);
    // 同じ packId の古い版は置き換えるので、重複の確認から外す
    const r0 = parsePackJson(text);
    const others = new Set(
      data.packs
        .filter((p) => !r0.ok || p.pack.packId !== r0.pack.packId)
        .flatMap((p) => p.pack.clips.flatMap((c) => c.items.map((i) => i.itemId))),
    );
    const r = parsePackJson(text, others);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors([]);
    const kind = packUpdateKind(data, r.pack);
    if (kind.kind === "sameOrOlder") {
      setPending({ pack: r.pack, warnings: r.warnings, oldVersion: kind.oldVersion });
      return;
    }
    save(
      r.pack,
      r.warnings,
      kind.kind === "upgrade"
        ? `版 ${kind.oldVersion} → ${r.pack.version} に置き換えました`
        : null,
    );
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setJson(text);
    setFileName(file.name);
    load(text);
  };

  /** テキスト欄の、その行を選んで見えるようにする。 */
  const goToLine = (line: number) => {
    const el = textRef.current;
    if (!el) return;
    const rows = el.value.split("\n");
    const start = rows.slice(0, line - 1).reduce((n, r) => n + r.length + 1, 0);
    const end = start + (rows[line - 1]?.length ?? 0);
    el.focus();
    el.setSelectionRange(start, end);
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    el.scrollTop = Math.max(0, (line - 3) * lh);
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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">パックを読み込む</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {local
            ? "パックはこの端末のブラウザの中にだけ保存されます。"
            : "パックはアカウントに保存され、ログインしたほかの端末でも使えます（本人しか読めません）。"}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json,text/plain"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button className={secondaryBtn} onClick={() => fileRef.current?.click()}>
          📄 ファイルを選ぶ
        </button>
        <p className="text-center text-xs text-zinc-500">または、下に貼り付ける</p>
        <textarea
          ref={textRef}
          className="h-48 w-full rounded-xl border border-zinc-300 bg-transparent p-3 font-mono text-base leading-6 dark:border-zinc-600"
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setFileName(null);
          }}
          placeholder='{ "schemaVersion": 1, "packId": ... }'
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          wrap="off"
          aria-label="パックの JSON"
        />
        {fileName && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            ファイル：{fileName}（中身を上に表示しています）
          </p>
        )}
        <button className={primaryBtn} onClick={() => load(json)} disabled={!json.trim()}>
          読み込む
        </button>

        {pending && (
          <div
            role="alertdialog"
            aria-label="置き換えの確認"
            className="flex flex-col gap-2 rounded-xl border-2 border-amber-400 p-3 text-sm"
          >
            <p>
              「{pending.pack.title}」（{pending.pack.packId}）はすでに読み込んであります。
              いまあるのは版 {pending.oldVersion}、読み込むのは版 {pending.pack.version}
              です。置き換えますか？
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={primaryBtn}
                onClick={() =>
                  save(pending.pack, pending.warnings, "置き換えました")
                }
              >
                置き換える
              </button>
              <button className={secondaryBtn} onClick={() => setPending(null)}>
                やめる
              </button>
            </div>
          </div>
        )}
        {message && (
          <p role="status" className="rounded-xl bg-emerald-100 p-3 text-sm dark:bg-emerald-900">
            {message}
          </p>
        )}
        {errors.length > 0 && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl bg-rose-100 p-3 text-sm dark:bg-rose-900"
          >
            <p className="font-bold">読み込めませんでした（{errors.length} 件）</p>
            <ul className="flex flex-col gap-2">
              {errors.slice(0, 30).map((e, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="flex-1">
                    {e.line !== undefined && (
                      <span className="font-bold">{e.line}行目　</span>
                    )}
                    <span className="font-mono text-xs break-all">{e.path}</span>
                    <br />
                    {e.message}
                  </div>
                  {e.line !== undefined && (
                    <button
                      className="h-10 shrink-0 rounded-lg border border-rose-400 px-2 text-xs"
                      onClick={() => goToLine(e.line!)}
                    >
                      行へ移動
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {errors.length > 30 && <p>ほか {errors.length - 30} 件</p>}
            <p className="text-xs">
              この内容をパックを作ったチャットに貼ると、直してもらえます。
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">読み込んだパック</h2>
        {data.packs.length === 0 && <p className="text-sm">まだありません。</p>}
        {[...data.packs]
          .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
          .map(({ pack, importedAt }) => (
            <div
              key={pack.packId}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
              data-testid={`pack-${pack.packId}`}
            >
              <div className="flex-1 text-sm">
                <div className="font-bold">{pack.title}</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  {pack.packId}・版 {pack.version}・{pack.clips.length} 本・
                  {countItems(pack)} 問
                  <br />
                  {new Date(importedAt).toLocaleString("ja-JP")} に読み込み
                </div>
              </div>
              <button
                className={`h-12 shrink-0 rounded-xl px-3 text-sm ${confirmDelete === pack.packId ? "bg-rose-600 text-white" : "border border-zinc-300 dark:border-zinc-600"}`}
                onClick={() => del(pack.packId)}
              >
                {confirmDelete === pack.packId ? "本当に削除" : "削除"}
              </button>
            </div>
          ))}
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          サンプル：{SAMPLE_PACK.title}（{SAMPLE_PACK.clips.length} 本・削除できません）。
          パックを削除しても、解答の記録は残ります（その問題は復習から外れます）。
        </p>
      </section>

      <InstallGuide />

      <DataSection />
    </div>
  );
}

function DataSection() {
  const data = useAppData();
  const local = useSyncStatus() === "local";
  const [confirmWipe, setConfirmWipe] = useState(0);
  const backupRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<{ data: AppData; dropped: number; name: string } | null>(null);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onBackupFile = async (file: File | undefined) => {
    if (!file) return;
    setBackupMsg(null);
    const r = parseBackup(await file.text());
    if (!r.ok) {
      setBackup(null);
      setBackupMsg({ ok: false, text: r.message });
      return;
    }
    setBackup({ data: r.data, dropped: r.dropped, name: file.name });
  };
  const json = JSON.stringify(data);
  const kb = Math.ceil(new Blob([json]).size / 1024);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `listen-shorts-${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">データ</h2>
      <p className="text-xs text-zinc-600 dark:text-zinc-400" data-testid="data-size">
        {local ? "この端末に保存しているデータ" : "アカウントのデータ"}：約 {kb} KB（解答 {data.answers.length} 件・
        復習 {data.review.length} 問・パック {data.packs.length} 個）。
        {local && "ブラウザの保存の上限は約 5 MB です。"}
      </p>
      <button className={secondaryBtn} onClick={exportData}>
        ⬇️ データを書き出す（JSON）
      </button>
      <input
        ref={backupRef}
        type="file"
        accept=".json,application/json,text/plain"
        className="hidden"
        data-testid="backup-input"
        onChange={(e) => {
          void onBackupFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button className={secondaryBtn} onClick={() => backupRef.current?.click()}>
        ⬆️ 書き出したファイルから読み込む
      </button>
      {backup && (
        <div
          role="alertdialog"
          aria-label="データの読み込みの確認"
          className="flex flex-col gap-2 rounded-xl border-2 border-amber-400 p-3 text-sm"
        >
          <p>
            「{backup.name}」の中身：解答 {backup.data.answers.length} 件・解いた本数{" "}
            {backup.data.clipResults.length}・復習 {backup.data.review.length} 問・パック{" "}
            {backup.data.packs.length} 個
            {backup.dropped > 0 && `（壊れていた ${backup.dropped} 件は読み飛ばします）`}。
          </p>
          <p className="font-bold">
            いまこの端末にあるデータは、すべてこの中身に置き換わります。
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={primaryBtn}
              onClick={() => {
                getStore().update(() => backup.data);
                setBackupMsg({ ok: true, text: "データを読み込みました" });
                setBackup(null);
              }}
            >
              置き換える
            </button>
            <button className={secondaryBtn} onClick={() => setBackup(null)}>
              やめる
            </button>
          </div>
        </div>
      )}
      {backupMsg && (
        <p
          role={backupMsg.ok ? "status" : "alert"}
          className={`rounded-xl p-3 text-sm ${backupMsg.ok ? "bg-emerald-100 dark:bg-emerald-900" : "bg-rose-100 dark:bg-rose-900"}`}
        >
          {backupMsg.text}
        </p>
      )}
      <button
        className={`h-12 w-full rounded-xl px-4 text-base font-semibold ${confirmWipe > 0 ? "bg-rose-600 text-white" : "border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300"}`}
        onClick={() => {
          if (confirmWipe === 0) {
            setConfirmWipe(1);
            return;
          }
          getStore().update(() => EMPTY_DATA);
          setConfirmWipe(0);
        }}
      >
        {confirmWipe > 0
          ? local
            ? "本当にすべて削除（元に戻せません）"
            : "本当にすべて削除（サーバーからも消えます）"
          : "すべてのデータを削除"}
      </button>
      {confirmWipe > 0 && (
        <button className={secondaryBtn} onClick={() => setConfirmWipe(0)}>
          やめる
        </button>
      )}
    </section>
  );
}
