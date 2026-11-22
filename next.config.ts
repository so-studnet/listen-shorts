import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 画面のテストで、偽の Supabase につなぐビルドを別の場所に作るため（playwright.config.ts）
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Service Worker は毎回取り直す（古いものが残らないように）
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // ほかのサイトの中に、このアプリを埋め込ませない
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // YouTube の埋め込みは送り元（オリジン）が要るので、no-referrer にはしない
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 使わない機能は止める（YouTube の再生に要る autoplay・encrypted-media などには触れない）
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
