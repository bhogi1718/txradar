/**
 * Regenerate the README screenshots from a running app with live data.
 *
 *   npm run dev            # in another terminal
 *   npx tsx scripts/screenshots.mts [baseUrl]
 *
 * Writes docs/screenshots/*.jpg (2× device scale, JPEG q88 to keep the repo light).
 */
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "docs/screenshots";
const ETH = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const TRX = "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .locator("[aria-busy=true]")
    .first()
    .waitFor({ state: "detached" })
    .catch(() => {});
  // Let charts, prices and the radar sweep reach a steady frame.
  await page.waitForTimeout(2500);
}

async function wallet(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("tbody tr").first().waitFor({ timeout: 90_000 });
  await settle(page);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const theme of ["dark", "light"] as const) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  await context.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator("input").first().blur();
  await page.screenshot({ path: `${OUT}/home-${theme}.jpg`, type: "jpeg", quality: 88 });

  await wallet(page, `/ethereum/${ETH}`);
  await page.screenshot({
    path: `${OUT}/wallet-${theme}.jpg`,
    type: "jpeg",
    quality: 88,
  });

  if (theme === "dark") {
    // Panels + table further down the page.
    await page
      .getByRole("heading", { name: "Top counterparties" })
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/panels-dark.jpg`, type: "jpeg", quality: 88 });

    // Counterparty inspector, opened from the busiest counterparty.
    await page.locator('button[title^="Inspect 0x"]').first().click();
    await page.getByRole("heading", { name: /their recent activity/i }).waitFor();
    await settle(page);
    await page.screenshot({
      path: `${OUT}/inspector-dark.jpg`,
      type: "jpeg",
      quality: 88,
    });

    // Tron wallet with TRC-20 tokens.
    await wallet(page, `/tron/${TRX}`);
    await page.screenshot({ path: `${OUT}/tron-dark.jpg`, type: "jpeg", quality: 88 });
  }
  await context.close();
}

// Phone layout.
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
await phone.addInitScript(() => localStorage.setItem("theme", "dark"));
const mobile = await phone.newPage();
await wallet(mobile, `/ethereum/${ETH}`);
await mobile.screenshot({ path: `${OUT}/mobile-dark.jpg`, type: "jpeg", quality: 88 });

await browser.close();
console.log(`Screenshots written to ${OUT}/`);
