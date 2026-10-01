import { NextRequest } from "next/server";

import { sharedCache } from "@/lib/cache";
import type { DailyPrices, TokenPriceMap } from "@/lib/prices";

const fetchDailyHistory = vi.fn<() => Promise<DailyPrices>>();
const fetchTokenPrices =
  vi.fn<(chain: string, contracts: string[]) => Promise<TokenPriceMap>>();

vi.mock("@/lib/prices", () => ({
  getPriceClient: () => ({ fetchDailyHistory, fetchTokenPrices }),
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
  beforeEach(() => {
    fetchTokenPrices.mockReset();
    sharedCache("token-prices").clear();
  });

  it("rejects invalid contracts for the chain", async () => {
    const res = await tokens.GET(
      new NextRequest(`http://x/api/token-prices?chain=tron&contracts=${USDT},0xnope`),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.issues[0].path).toBe("contracts.1");
  });

  it("dedupes and sorts contracts so equivalent requests share a cache entry", async () => {
    fetchTokenPrices.mockResolvedValue({ [USDT]: 1 });
    await tokens.GET(
      new NextRequest(`http://x/api/token-prices?chain=tron&contracts=${USDT},${USDT}`),
    );
    const res = await tokens.GET(
      new NextRequest(`http://x/api/token-prices?chain=tron&contracts=${USDT}`),
    );

    expect(fetchTokenPrices).toHaveBeenCalledTimes(1);
    expect(fetchTokenPrices).toHaveBeenCalledWith("tron", [USDT]);
    expect(res.headers.get("x-cache")).toBe("HIT");
    expect((await res.json()).data.prices).toEqual({ [USDT]: 1 });
  });
});
