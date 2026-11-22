// ListenShorts - Service Worker
// ホーム画面に追加して使うための最小限のもの。オフライン用のキャッシュはしない
// （動画の再生にはどのみちネットが必要で、古い画面が残る不具合を避けるため）。

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 通信はすべてブラウザに任せる（fetch を横取りしない）
