"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_DATA, type AppData } from "@/lib/domain/records";
import {
  LocalStorageStore,
  SwitchableAppStore,
  type AppStore,
  type SyncStatus,
} from "./app-store";

let local: LocalStorageStore | null = null;
let store: SwitchableAppStore | null = null;

/** このブラウザ内の保存先（ログイン前の保存先・取り込み元）。ブラウザでだけ作る。 */
export function getLocalStore(): LocalStorageStore {
  if (!local) local = new LocalStorageStore();
  return local;
}

/** アプリ全体で1つのストア（保存先はログイン状態で切り替わる）。ブラウザでだけ作る。 */
export function getStore(): SwitchableAppStore {
  if (!store) store = new SwitchableAppStore(getLocalStore());
  return store;
}

const serverStore: Pick<AppStore, "subscribe" | "getSnapshot" | "getServerSnapshot"> = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY_DATA,
  getServerSnapshot: () => EMPTY_DATA,
};

export function useAppData(): AppData {
  const s = typeof window === "undefined" ? serverStore : getStore();
  return useSyncExternalStore(s.subscribe, s.getSnapshot, s.getServerSnapshot);
}

const localStatus = (): SyncStatus => "local";

export function useSyncStatus(): SyncStatus {
  const s = typeof window === "undefined" ? null : getStore();
  return useSyncExternalStore(
    s ? s.subscribe : serverStore.subscribe,
    s ? s.getStatus : localStatus,
    localStatus,
  );
}
