"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** ブラウザで描画しているか（サーバーでの描画と最初のハイドレーションでは false）。 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
