"use client";
/** ホーム画面への追加の案内。ホーム画面のアプリとして開いているかを見て出し分ける。 */
import { useSyncExternalStore } from "react";

const QUERY = "(display-mode: standalone)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia(QUERY).matches || nav.standalone === true;
}

export function InstallGuide() {
  const standalone = useSyncExternalStore(subscribe, isStandalone, () => false);
  const ios = useSyncExternalStore(
    () => () => {},
    () => /iPhone|iPad|iPod/.test(navigator.userAgent),
    () => false,
  );
  return (
    <section className="flex flex-col gap-2" data-testid="install-guide">
      <h2 className="text-sm font-bold">アプリとして使う</h2>
      {standalone ? (
        <p className="text-sm" data-testid="standalone">
          ✅ ホーム画面のアプリとして開いています。
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
          {ios ? (
            <ol className="list-decimal pl-5">
              <li>Safari の下にある共有ボタン（□ に ↑ のマーク）を押す</li>
              <li>一覧を上にずらして「ホーム画面に追加」を押す</li>
              <li>右上の「追加」を押す</li>
            </ol>
          ) : (
            <p>
              ブラウザのメニュー（⋮ など）から「ホーム画面に追加」または「アプリをインストール」を選ぶと、アプリとして使えます。
            </p>
          )}
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            iPhone では、ホーム画面のアプリと Safari とで保存場所が別になります。Safari
            で解いた記録を移すときは、Safari で下の「データを書き出す」をしてから、ホーム画面のアプリで「書き出したファイルから読み込む」を使ってください。
          </p>
        </div>
      )}
    </section>
  );
}
