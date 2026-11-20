/**
 * 保存先のインターフェースと、localStorage の実装。
 * 画面は useAppData()（useSyncExternalStore）で読む。M8 で Supabase の実装を足す。
 */
import { EMPTY_DATA, loadAppData, type AppData } from "@/lib/domain/records";

export interface AppStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppData;
  getServerSnapshot(): AppData;
  update(fn: (data: AppData) => AppData): void;
}

export const STORAGE_KEY = "listen-shorts:v1:data";

export class LocalStorageStore implements AppStore {
  private data: AppData | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly key = STORAGE_KEY) {}

  private read(): AppData {
    try {
      const raw = window.localStorage.getItem(this.key);
      return raw ? loadAppData(JSON.parse(raw)) : EMPTY_DATA;
    } catch {
      return EMPTY_DATA;
    }
  }

  private onStorage = (e: StorageEvent) => {
    if (e.key !== this.key) return;
    this.data = this.read();
    this.emit();
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1)
      window.addEventListener("storage", this.onStorage);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0)
        window.removeEventListener("storage", this.onStorage);
    };
  };

  getSnapshot = (): AppData => {
    if (this.data === null) this.data = this.read();
    return this.data;
  };

  getServerSnapshot = (): AppData => EMPTY_DATA;

  update = (fn: (data: AppData) => AppData) => {
    const next = fn(this.getSnapshot());
    if (next === this.data) return;
    this.data = next;
    try {
      window.localStorage.setItem(this.key, JSON.stringify(next));
    } catch (e) {
      console.error("保存に失敗しました", e);
    }
    this.emit();
  };
}
