import { expect, test, type Page } from "@playwright/test";

import { ETH_WALLET, mockApi, PEER } from "./mock-api";

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("home page fits a phone screen", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByLabel("Wallet address")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("wallet page fits a phone screen", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/ethereum/${ETH_WALLET}`);
  await expect(page.locator("tbody tr").first()).toBeAttached();
  await expectNoHorizontalScroll(page);
});

test("inspector takes the full width on a phone", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/ethereum/${ETH_WALLET}?trail=${PEER}`);
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  const width = page.viewportSize()!.width;
  expect(Math.round(box!.width)).toBeGreaterThanOrEqual(width - 1);
});
