import { createCoinGeckoClient } from "./coingecko";

// Recorded 2026-09-19 from /simple/price.
const FIXTURE = {
  bitcoin: { usd: 80981, usd_24h_change: 4.534391394175207, last_updated_at: 1789798720 },
  ethereum: {
    usd: 2624.79,
    usd_24h_change: 5.707594348513019,
    last_updated_at: 1789798720,
  },
  tron: { usd: 0.33752, usd_24h_change: 0.5196837143787125, last_updated_at: 1789798720 },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("coingecko client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(FIXTURE));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requests all chain ids in USD with change + timestamp, no key header by default", async () => {
    await createCoinGeckoClient(undefined).fetchPrices();
    const [url, init] = fetchMock.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.pathname).toBe("/api/v3/simple/price");
    expect(u.searchParams.get("ids")).toBe("bitcoin,ethereum,tron");
    expect(u.searchParams.get("vs_currencies")).toBe("usd");
    expect(init?.headers).not.toHaveProperty("x-cg-demo-api-key");
  });

  it("sends the demo key header when configured", async () => {
    await createCoinGeckoClient("DEMO").fetchPrices();
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
      "x-cg-demo-api-key": "DEMO",
    });
  });

  it("normalizes to a PriceMap keyed by chain", async () => {
    const prices = await createCoinGeckoClient(undefined).fetchPrices();
    expect(prices.bitcoin).toEqual({
      usd: 80981,
      change24h: FIXTURE.bitcoin.usd_24h_change,
      updatedAt: 1789798720000,
    });
    expect(prices.tron?.usd).toBe(0.33752);
  });

  it("only requests the chains asked for", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ethereum: FIXTURE.ethereum }));
    const prices = await createCoinGeckoClient(undefined).fetchPrices(["ethereum"]);
    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get("ids")).toBe(
      "ethereum",
    );
    expect(Object.keys(prices)).toEqual(["ethereum"]);
  });

  it("tolerates missing optional fields", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ bitcoin: { usd: 1 } }));
    const prices = await createCoinGeckoClient(undefined).fetchPrices(["bitcoin"]);
    expect(prices.bitcoin).toEqual({ usd: 1, change24h: null, updatedAt: null });
  });

  it("maps 429 to RATE_LIMITED", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(createCoinGeckoClient(undefined).fetchPrices()).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});

describe("coingecko history and token prices", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("collapses market_chart points to one per UTC day", async () => {
    const day = Date.UTC(2026, 8, 30);
    fetchMock.mockResolvedValue(
      jsonResponse({
        prices: [
          [day - 86_400_000, 90],
          [day, 100],
          [day + 3_600_000 * 5, 105], // intraday "now" point replaces the midnight close
        ],
      }),
    );
    const series = await createCoinGeckoClient(undefined).fetchDailyHistory("ethereum");
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe("/api/v3/coins/ethereum/market_chart");
    expect(url.searchParams.get("days")).toBe("365");
    expect(series).toEqual([
      [day - 86_400_000, 90],
      [day, 105],
    ]);
  });

  it("prices one token contract per request", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { usd: 1.0001 } }),
    );
    const price = await createCoinGeckoClient(undefined).fetchTokenPrice(
      "ethereum",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    );
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe("/api/v3/simple/token_price/ethereum");
    expect(url.searchParams.get("contract_addresses")).toBe(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    );
    // matched despite CoinGecko lowercasing the key; no cap reported → null
    expect(price).toEqual({ usd: 1.0001, marketCap: null });
  });

  it("returns null when CoinGecko has no price for the contract", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(
      createCoinGeckoClient(undefined).fetchTokenPrice(
        "tron",
        "THxYWbzAgzQgQaYi9G4mjeL1tq1hdrZe55",
      ),
    ).resolves.toBeNull();
  });

  it("returns the market cap alongside the price when reported", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ "0xabc": { usd: 0.015, usd_market_cap: 13_698_718 } }),
    );
    await expect(
      createCoinGeckoClient(undefined).fetchTokenPrice("ethereum", "0xabc"),
    ).resolves.toEqual({ usd: 0.015, marketCap: 13_698_718 });
    expect(
      new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get("include_market_cap"),
    ).toBe("true");
  });
});
