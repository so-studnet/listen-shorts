// アイコンの PNG を作る。scripts/icon.svg を Playwright（Chromium）で描いて保存する。
//   node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
const outputs = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["src/app/apple-icon.png", 180],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  writeFileSync(file, await page.locator("svg").screenshot({ omitBackground: false }));
  console.log("wrote", file);
}
await browser.close();
// ブラウザのタブ用（favicon）は SVG をそのまま使う
writeFileSync("src/app/icon.svg", svg);
console.log("wrote src/app/icon.svg");
