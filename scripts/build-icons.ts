import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `npx tsx scripts/build-icons.ts`: renders public/icons/icon.svg to the PWA icons (T165) with
 * the Playwright Chromium the e2e tests already use, so no image library is needed.
 * The maskable icon is full-bleed with the chip inside the 80% safe zone.
 */

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const svg = readFileSync(join(dir, "icon.svg"), "utf8");
// Maskable: square background (the platform applies its own mask), chip scaled into the safe zone.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<g transform="translate(256 256)">', '<g transform="translate(256 256) scale(0.8)">');

const outputs = [
  { file: "icon-192.png", size: 192, source: svg },
  { file: "icon-512.png", size: 512, source: svg },
  { file: "icon-maskable-512.png", size: 512, source: maskable },
  // iOS rounds the corners itself and shows transparency as black: use the full-bleed version.
  { file: "apple-touch-icon.png", size: 180, source: maskable },
];

const browser = await chromium.launch();
try {
  for (const { file, size, source } of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const sized = source.replace("<svg ", `<svg width="${size}" height="${size}" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    await page.screenshot({ path: join(dir, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`${file} ${size}×${size}`);
  }
} finally {
  await browser.close();
}
