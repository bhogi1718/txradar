import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { BTC_WALLET, ETH_WALLET, mockApi, PEER, TRX_WALLET } from "./mock-api";

/** WCAG 2.1 A/AA rules; fail on serious or critical findings. */
async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    blocking.map(
      (v) =>
        `${v.id}: ${v.help} — ${v.nodes
          .map(
            (n) =>
              `${n.target.join(" ")}${n.any[0]?.message ? ` (${n.any[0].message})` : ""}`,
          )
          .join(" | ")}`,
    ),
  ).toEqual([]);
}

for (const theme of ["dark", "light"] as const) {
  test.describe(`accessibility (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await mockApi(page);
    });

    test("home page", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByLabel("Wallet address")).toBeVisible();
      await audit(page);
    });

    test("wallet page", async ({ page }) => {
      await page.goto(`/ethereum/${ETH_WALLET}`);
      await expect(page.locator("tbody tr").first()).toBeVisible();
      await audit(page);
    });

    test("bitcoin and tron wallets (chain badges, token rows)", async ({ page }) => {
      for (const path of [`/bitcoin/${BTC_WALLET}`, `/tron/${TRX_WALLET}`]) {
        await page.goto(path);
        await expect(page.locator("tbody tr").first()).toBeVisible();
        await audit(page);
      }
    });

    test("counterparty inspector", async ({ page }) => {
      await page.goto(`/ethereum/${ETH_WALLET}?trail=${PEER}`);
      await expect(page.getByRole("dialog").getByText("With this wallet")).toBeVisible();
      await audit(page);
    });
  });
}

test("skip link is the first tab stop and targets main content", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/ethereum/${ETH_WALLET}`);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute("href", "#main");
  await expect(page.locator("main#main")).toHaveCount(1);
});
