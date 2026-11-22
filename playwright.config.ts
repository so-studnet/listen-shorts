import { defineConfig } from "@playwright/test";

const PORT = 3100;
/** 偽の Supabase（e2e/fake-supabase.ts）につなぐビルド */
const SUPABASE_PORT = 3101;
export const FAKE_SUPABASE_URL = "https://test-project.supabase.co";

const common = {
  // iPhone の大きさ。WebKit は入っていないので Chromium で代用する
  browserName: "chromium" as const,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
  trace: "off" as const,
};

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  projects: [
    {
      name: "local",
      testIgnore: /supabase\.spec\.ts/,
      use: { ...common, baseURL: `http://localhost:${PORT}` },
    },
    {
      name: "supabase",
      testMatch: /supabase\.spec\.ts/,
      use: { ...common, baseURL: `http://localhost:${SUPABASE_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: `npx next build && npx next start -p ${SUPABASE_PORT}`,
      url: `http://localhost:${SUPABASE_PORT}`,
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-supabase-test",
        NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
    },
  ],
});
