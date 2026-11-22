"use client";
import { useEffect } from "react";

/** Service Worker を登録する（本番のみ）。 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((e) => console.warn("Service Worker を登録できませんでした", e));
  }, []);
  return null;
}
