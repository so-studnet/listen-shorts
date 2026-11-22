/**
 * 保存先のインターフェースと、localStorage の実装、保存先を切り替えられるストア。
 * 画面は useAppData()（useSyncExternalStore）で読む。
 * ログインしていなければブラウザ内（localStorage）、ログインすると Supabase に保存する。
 */
import { EMPTY_DATA, loadAppData, type AppData } from "@/lib/domain/records";

export type SyncStatus = "local" | "loading" | "synced" | "saving" | "error" | "offline";

export interface AppStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppData;
  getServerSnapshot(): AppData;
  update(fn: (data: AppData) => AppData): void;
  /** 同期の状態。ブラウザ内保存なら "local" */
  getStatus?(): SyncStatus;
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

  getStatus = (): SyncStatus => "local";

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

/** 保存先を切り替えられるストア。画面はこれだけを使う。 */
export class SwitchableAppStore implements AppStore {
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;

  constructor(private backend: AppStore) {
    this.unsubscribe = backend.subscribe(this.notify);
  }

  private notify = () => this.listeners.forEach((l) => l());

  setBackend(backend: AppStore): void {
    if (backend === this.backend) return;
    this.unsubscribe();
    this.backend = backend;
    this.unsubscribe = backend.subscribe(this.notify);
    this.notify();
  }

  getBackend(): AppStore {
    return this.backend;
  }

  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    return () => {
      this.listeners.delete(onChange);
    };
  };
  getSnapshot = () => this.backend.getSnapshot();
  getServerSnapshot = () => this.backend.getServerSnapshot();
  getStatus = (): SyncStatus => this.backend.getStatus?.() ?? "local";
  update = (fn: (prev: AppData) => AppData) => this.backend.update(fn);
}
