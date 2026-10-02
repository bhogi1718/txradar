import { NextRequest } from "next/server";

import { sharedCache } from "@/lib/cache";
import { UpstreamError } from "@/lib/chains/errors";
import type { DailyPrices } from "@/lib/prices";

const fetchDailyHistory = vi.fn<() => Promise<DailyPrices>>();
const fetchTokenPrice =
  vi.fn<(chain: string, contract: string) => Promise<number | null>>();

vi.mock("@/lib/prices", () => ({
  getPriceClient: () => ({ fetchDailyHistory, fetchTokenPrice }),
}));

const history = await import("./price-history/route");
const tokens = await import("./token-prices/route");

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("GET /api/price-history", () => {
  beforeEach(() => {
    fetchDailyHistory.mockReset();
    sharedCache("price-history").clear();
  });

  it("validates the chain", async () => {
    const res = await history.GET(
      new NextRequest("http://x/api/price-history?chain=doge"),
    );
    expect(res.status).toBe(400);
  });

  it("returns and caches the daily series per chain", async () => {
    fetchDailyHistory.mockResolvedValue([[1, 100]]);
    const req = () => new NextRequest("http://x/api/price-history?chain=ethereum");
    const body = await (await history.GET(req())).json();
    expect(body.data).toMatchObject({
      chain: "ethereum",
      prices: [[1, 100]],
      cached: false,
    });
    expect((await history.GET(req())).headers.get("x-cache")).toBe("HIT");
    expect(fetchDailyHistory).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/token-prices", () => {
  const SPAM = "THxYWbzAgzQgQaYi9G4mjeL1tq1hdrZe55";
  const req = (contracts: string) =>
    new NextRequest(`http://x/api/token-prices?chain=tron&contracts=${contracts}`);

  beforeEach(() => {
    fetchTokenPrice.mockReset();
    sharedCache("token-prices").clear();
  });

  it("rejects invalid contracts for the chain", async () => {
    const res = await tokens.GET(req(`${USDT},0xnope`));
    expect(res.status).toBe(400);
    expect((await res.json()).error.issues[0].path).toBe("contracts.1");
  });

  it("looks contracts up one by one and separates priced from unpriced", async () => {
    fetchTokenPrice.mockImplementation(async (_chain, c) => (c === USDT ? 1 : null));
    const res = await tokens.GET(req(`${USDT},${SPAM}`));

    expect(fetchTokenPrice.mock.calls).toEqual([
      ["tron", USDT],
      ["tron", SPAM],
    ]);
    expect((await res.json()).data.pricing).toEqual({
      prices: { [USDT]: 1 },
      unpriced: [SPAM],
    });
  });

  it("caches each contract's answer, including 'no price'", async () => {
    fetchTokenPrice.mockImplementation(async (_chain, c) => (c === USDT ? 1 : null));
    await tokens.GET(req(`${USDT},${SPAM}`));
    await tokens.GET(req(`${SPAM},${USDT}`));
    expect(fetchTokenPrice).toHaveBeenCalledTimes(2);
  });

  it("leaves a failed contract out instead of calling it unpriced", async () => {
    fetchTokenPrice.mockImplementation(async (_chain, c) => {
      if (c === SPAM)
        throw new UpstreamError("TIMEOUT", "slow", { provider: "coingecko" });
      return 1;
    });
    const body = await (await tokens.GET(req(`${USDT},${SPAM}`))).json();
    expect(body.data.pricing).toEqual({ prices: { [USDT]: 1 }, unpriced: [] });
  });

  it("stops at a rate limit and reports it when nothing is known", async () => {
    fetchTokenPrice.mockRejectedValue(
      new UpstreamError("RATE_LIMITED", "slow", { provider: "coingecko", retryAfter: 9 }),
    );
    const res = await tokens.GET(req(`${USDT},${SPAM}`));
    expect(res.status).toBe(429);
    expect(fetchTokenPrice).toHaveBeenCalledTimes(1);
  });
});
