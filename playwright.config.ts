import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // iPhone の大きさ。WebKit は入っていないので Chromium で代用する
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "off",
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
