import { sharedCache } from "@/lib/cache";
import { UpstreamError } from "@/lib/chains/errors";
import type { PriceMap } from "@/lib/prices";

const fetchPrices = vi.fn<() => Promise<PriceMap>>();

vi.mock("@/lib/prices", () => ({
  getPriceClient: () => ({ fetchPrices }),
}));

const { GET } = await import("./route");

const prices: PriceMap = {
  bitcoin: { usd: 80981, change24h: 4.5, updatedAt: 1789798720000 },
  ethereum: { usd: 2624.79, change24h: 5.7, updatedAt: 1789798720000 },
  tron: { usd: 0.33752, change24h: 0.5, updatedAt: 1789798720000 },
};

describe("GET /api/prices", () => {
  beforeEach(() => {
    fetchPrices.mockReset();
    sharedCache("prices").clear();
  });

  it("returns the price map in the envelope", async () => {
    fetchPrices.mockResolvedValue(prices);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.prices).toEqual(prices);
    expect(body.data.cached).toBe(false);
  });

  it("caches for subsequent calls", async () => {
    fetchPrices.mockResolvedValue(prices);
    await GET();
    const res = await GET();
    expect(res.headers.get("x-cache")).toBe("HIT");
    expect(fetchPrices).toHaveBeenCalledTimes(1);
  });

  it("maps upstream failures", async () => {
    fetchPrices.mockRejectedValue(
      new UpstreamError("TIMEOUT", "slow", { provider: "coingecko" }),
    );
    const res = await GET();
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe("TIMEOUT");
  });
});
