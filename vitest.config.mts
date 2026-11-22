import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 日付の区切り（午前4時）のテストが、動かす環境のタイムゾーンに左右されないようにする
process.env.TZ = "Asia/Tokyo";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
