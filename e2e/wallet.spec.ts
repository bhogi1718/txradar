import { expect, test } from "@playwright/test";

import {
  BINANCE_14,
  BTC_WALLET,
  ETH_WALLET,
  mockApi,
  PEER,
  PEER_OF_PEER,
  TRX_WALLET,
} from "./mock-api";

test.describe("search", () => {
  test("detects the chain while typing and opens the canonical wallet URL", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/");
    const input = page.getByLabel("Wallet address");

    await input.fill(TRX_WALLET);
    await expect(page.getByRole("search").getByText("Tron")).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(`/tron/${TRX_WALLET}`);
  });

  test("explains an invalid address without navigating", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByLabel("Wallet address").fill("0x1234");
    await page.getByRole("button", { name: "Scan" }).click();
    await expect(page.getByRole("search").getByRole("alert")).toContainText(
      "looks like a Ethereum address",
    );
    await expect(page).toHaveURL("/");
  });

  test("redirects a mixed-case EVM address to its canonical form", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/ethereum/${ETH_WALLET.toUpperCase().replace("0X", "0x")}`);
    await expect(page).toHaveURL(`/ethereum/${ETH_WALLET}`);
  });

  test("shows the 404 page for an address that isn't valid on the chain", async ({
    page,
  }) => {
    await page.goto(`/bitcoin/${ETH_WALLET}`);
    await expect(
      page.getByRole("heading", { name: "Nothing on the radar here" }),
    ).toBeVisible();
  });
});

test.describe("wallet page", () => {
  for (const [chain, address, symbol] of [
    ["ethereum", ETH_WALLET, "ETH"],
    ["bitcoin", BTC_WALLET, "BTC"],
    ["tron", TRX_WALLET, "TRX"],
  ] as const) {
    test(`renders summary, chart and table for ${chain}`, async ({ page }) => {
      await mockApi(page);
      await page.goto(`/${chain}/${address}`);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(address);
      await expect(page.getByText("Net flow", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Flow timeline" })).toBeVisible();
      await expect(page.locator("tbody tr").first()).toBeVisible();
      await expect(page.getByText(new RegExp(`Fee \\(${symbol}\\)`, "i"))).toBeVisible();
    });
  }

  test("labels known entities and prices tokens", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/ethereum/${ETH_WALLET}`);
    await expect(page.getByRole("button", { name: /Binance 14/ }).first()).toBeVisible();

    await page.goto(`/tron/${TRX_WALLET}`);
    const usdt = page.getByRole("button", { name: /USDT/ }).first();
    await expect(usdt).toBeVisible();
    await expect(usdt.getByText("−$15.00")).toBeVisible();
  });

  test("filters are reflected in the URL and survive a reload", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/ethereum/${ETH_WALLET}`);
    await page.getByRole("radio", { name: /^Out/ }).click();
    await page.getByRole("checkbox", { name: "Hide failed" }).check();
    await expect(page).toHaveURL(/dir=out/);
    await expect(page).toHaveURL(/hideFailed=1/);

    await page.reload();
    await expect(page.getByRole("radio", { name: /^Out/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("tbody tr")).toHaveCount(2);
  });

  test("follows the money through the counterparty inspector", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/ethereum/${ETH_WALLET}`);

    await page.getByTitle(`Inspect ${PEER}`).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("With this wallet")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`trail=${PEER}`));

    await sheet.getByTitle(`Follow to ${PEER_OF_PEER}`).click();
    const path = sheet.getByRole("navigation", { name: "Drill-down path" });
    await expect(path.locator("[aria-current=page]")).toHaveText("0x00…00bb");
    await expect(page).toHaveURL(/trail=0x0+aa%2C0x0+bb|trail=0x0+aa,0x0+bb/);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/trail=/);
  });

  test("does not scan a known exchange until asked", async ({ page }) => {
    const requests = await mockApi(page);
    await page.goto(`/ethereum/${ETH_WALLET}?trail=${BINANCE_14}`);
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: "Scan anyway" })).toBeVisible();
    expect(requests.some((r) => r.includes(`address=${BINANCE_14}`))).toBe(false);

    await sheet.getByRole("button", { name: "Scan anyway" }).click();
    await expect
      .poll(() => requests.some((r) => r.includes(`address=${BINANCE_14}`)))
      .toBe(true);
  });

  test("exports the filtered rows as CSV", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/ethereum/${ETH_WALLET}?dir=in`);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^txradar-ethereum-0xd8da6bf2-all-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const lines = Buffer.concat(chunks)
      .toString("utf8")
      .replace(/^﻿/, "")
      .trimEnd()
      .split("\r\n");
    expect(lines[0]).toMatch(/^timestamp_utc,chain,hash,direction/);
    expect(lines.slice(1).every((l) => l.split(",")[3] === "in")).toBe(true);
    expect(lines.length - 1).toBe(2);
  });

  test("loads older history on demand and then reports the full history", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto(`/ethereum/${ETH_WALLET}`);
    await expect(page.getByText("Latest 5 transactions")).toBeVisible();

    await page.getByRole("button", { name: "Load older" }).first().click();
    await expect(page.getByText("Full history · 6 transactions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Load older" })).toHaveCount(0);
  });

  test("shows a rate-limit error with a retry countdown", async ({ page }) => {
    await mockApi(page, {
      failWith: {
        [ETH_WALLET]: {
          status: 429,
          code: "RATE_LIMITED",
          message: "slow down",
          retryAfter: 3,
        },
      },
    });
    await page.goto(`/ethereum/${ETH_WALLET}`);
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "asked us to slow down",
    );
    await expect(page.getByRole("button", { name: /Retry in \ds/ })).toBeDisabled();
  });
});
