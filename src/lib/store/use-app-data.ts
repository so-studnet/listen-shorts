"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_DATA, type AppData } from "@/lib/domain/records";
import { LocalStorageStore, type AppStore } from "./app-store";

let store: AppStore | null = null;

/** アプリ全体で1つのストア。ブラウザでだけ作る。 */
export function getStore(): AppStore {
  if (!store) store = new LocalStorageStore();
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
