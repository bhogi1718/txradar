import { sharedCache } from "@/lib/cache";
import { makeTx } from "@/test/factories";

import { annotateListed, loadTokenList } from "./token-list";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("loadTokenList", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    sharedCache("token-list").clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads the chain's CoinGecko list, lowercasing EVM addresses", async () => {
    fetchMock.mockResolvedValue(
      json({ tokens: [{ address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }] }),
    );
    const list = await loadTokenList("ethereum");
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://tokens.coingecko.com/ethereum/all.json",
    );
    expect(list!.has("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toBe(true);
  });

  it("keeps base58 addresses exact on Tron", async () => {
    fetchMock.mockResolvedValue(
      json({ tokens: [{ address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }] }),
    );
    const list = await loadTokenList("tron");
    expect(list!.has("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(true);
    expect(list!.has("tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t")).toBe(false);
  });

  it("caches the list and skips Bitcoin entirely", async () => {
    fetchMock.mockResolvedValue(json({ tokens: [] }));
    await loadTokenList("ethereum");
    await loadTokenList("ethereum");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(loadTokenList("bitcoin")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("annotateListed", () => {
  const usdc = {
    symbol: "USDC",
    contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
  };
  const scam = {
    symbol: "SCAM",
    contract: "0x00000000000000000000000000000000000000ff",
    decimals: 18,
  };
  const list = new Set([usdc.contract]);

  it("marks listed and unlisted tokens and leaves native coins unset", () => {
    const [native, good, bad] = annotateListed(
      [makeTx({}), makeTx({ asset: usdc }), makeTx({ asset: scam })],
      list,
    );
    expect(native!.asset.listed).toBeUndefined();
    expect(good!.asset.listed).toBe(true);
    expect(bad!.asset.listed).toBe(false);
  });

  it("matches EVM contracts case-insensitively", () => {
    const [tx] = annotateListed(
      [
        makeTx({
          asset: { ...usdc, contract: usdc.contract.toUpperCase().replace("0X", "0x") },
        }),
      ],
      list,
    );
    expect(tx!.asset.listed).toBe(true);
  });

  it("never lists TRC-10 ids and changes nothing without a list", () => {
    const trc10 = makeTx({
      chain: "tron",
      asset: { symbol: "TRC-10 #1", contract: "trc10:1", decimals: 0 },
    });
    expect(
      annotateListed([trc10], new Set(["TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"]))[0]!.asset
        .listed,
    ).toBe(false);
    expect(annotateListed([trc10], null)[0]!.asset.listed).toBeUndefined();
  });
});
