import { expect, test } from "@playwright/test";

import { ETH_WALLET, mockApi, PEER } from "./mock-api";

/**
 * The CSP is only worth having if the app still works under it: pages must
 * load and interact with zero violations (a blocked script would also show
 * up as a broken page in the other specs, but not a blocked eval probe or
 * inline style).
 */
test.describe("security headers", () => {
  test("pages carry a nonce-based CSP and the static hardening headers", async ({
    page,
  }) => {
    const res = await page.goto("/");
    const headers = res!.headers();
    const csp = headers["content-security-policy"] ?? "";

    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();

    // A fresh nonce per request.
    const again = (await page.request.get("/")).headers()["content-security-policy"];
    expect(again).not.toBe(csp);
  });

  test("the app runs without CSP violations", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as typeof window & { __cspViolations: string[] };
      w.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    await mockApi(page);

    await page.goto("/");
    await page.goto(`/ethereum/${ETH_WALLET}`);
    await expect(page.locator("tbody tr").first()).toBeVisible();
    // Open the inspector and flip the theme: both inject UI at runtime.
    await page.getByTitle(`Inspect ${PEER}`).first().click();
    await expect(
      page.getByRole("heading", { name: /their recent activity/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /theme/i }).click();

    const violations = await page.evaluate(
      () => (window as typeof window & { __cspViolations: string[] }).__cspViolations,
    );
    expect(violations).toEqual([]);
  });
});
