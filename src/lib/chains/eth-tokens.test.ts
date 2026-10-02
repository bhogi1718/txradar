import { sharedCache } from "@/lib/cache";
import { makeTx } from "@/test/factories";

import internalFixture from "./__fixtures__/etherscan-txlistinternal.json";
import tokenFixture from "./__fixtures__/etherscan-tokentx.json";
import txlistFixture from "./__fixtures__/etherscan-txlist.json";
import { createEthereumAdapter, normalizeInternalTx, normalizeTokenTx } from "./ethereum";
import { mergeTokenTransfers } from "./merge";

const W = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("normalizeTokenTx", () => {
  it("parses a recorded DAI send with its token decimals", () => {
    const raw = tokenFixture.result.find((t) => t.hash.startsWith("0x4cb3f2185d"))!;
    expect(normalizeTokenTx(raw, W)).toMatchObject({
      direction: "out",
      category: "token-transfer",
      asset: { symbol: "DAI", contract: DAI, decimals: 18 },
      value: 15,
      fee: null,
      status: "success",
      method: "transfer",
    });
  });

  it("parses incoming tokens and keeps huge spam amounts finite", () => {
    for (const raw of tokenFixture.result.filter((t) => t.to === W)) {
      const tx = normalizeTokenTx(raw, W);
      expect(tx.direction).toBe("in");
      expect(Number.isFinite(tx.value)).toBe(true);
    }
  });

  it("trims long spam symbols and survives junk decimals", () => {
    const raw = {
      ...tokenFixture.result[0]!,
      tokenSymbol: "  Visit   claim-free-tokens-now-dot-example  for  a  reward  ",
      tokenDecimal: "not-a-number",
      value: "12",
    };
    const tx = normalizeTokenTx(raw, W);
    expect(tx.asset.symbol.length).toBeLessThanOrEqual(32);
    expect(tx.asset.symbol).not.toMatch(/\s{2,}/);
    expect(tx.asset.decimals).toBe(0);
    expect(tx.value).toBe(12);
  });

  it("falls back to the token name, then a placeholder", () => {
    const base = tokenFixture.result[0]!;
    expect(normalizeTokenTx({ ...base, tokenSymbol: " " }, W).asset.symbol).toBe(
      base.tokenName.trim().slice(0, 31) + (base.tokenName.trim().length > 32 ? "…" : ""),
    );
    expect(
      normalizeTokenTx({ ...base, tokenSymbol: "", tokenName: "" }, W).asset.symbol,
    ).toBe("TOKEN");
  });
});

describe("normalizeInternalTx", () => {
  it("records ETH a contract sent to the wallet, with no fee", () => {
    const raw = internalFixture.result[0]!;
    const tx = normalizeInternalTx(raw, W);
    expect(tx).toMatchObject({
      direction: "in",
      category: "internal-transfer",
      isContract: true,
      fee: null,
      to: W,
      status: "success",
      asset: { symbol: "ETH", contract: null },
    });
    expect(tx.value).toBeCloseTo(Number(raw.value) / 1e18, 18);
  });

  it("zeroes the value of a failed internal call", () => {
    const raw = internalFixture.result.find((t) => t.isError === "1")!;
    expect(normalizeInternalTx(raw, W)).toMatchObject({ status: "failed", value: 0 });
  });
});

describe("mergeTokenTransfers", () => {
  const call = makeTx({
    hash: "0xswap",
    direction: "out",
    category: "contract-call",
    value: 0,
    fee: 0.01,
    blockHeight: 99,
  });
  const usdcOut = makeTx({
    hash: "0xswap",
    direction: "out",
    asset: { symbol: "USDC", contract: "0xusdc", decimals: 6 },
    value: 100,
    fee: null,
  });
  const daiIn = makeTx({
    hash: "0xswap",
    direction: "in",
    asset: { symbol: "DAI", contract: DAI, decimals: 18 },
    value: 99.5,
    fee: null,
  });

  it("absorbs the value-0 call and charges its gas once across a swap's legs", () => {
    const merged = mergeTokenTransfers([call], [usdcOut, daiIn]);
    expect(merged).toHaveLength(2);
    expect(merged.map((t) => t.fee)).toEqual([0.01, null]);
    expect(merged.every((t) => t.blockHeight === 99)).toBe(true);
  });

  it("keeps an internal ETH refund that shares the call's hash", () => {
    const refund = makeTx({
      hash: "0xswap",
      direction: "in",
      category: "internal-transfer",
      value: 0.002,
    });
    const merged = mergeTokenTransfers([call, refund], [usdcOut]);
    expect(merged).toContainEqual(refund);
    expect(merged).not.toContainEqual(call);
  });

  it("leaves calls that moved ETH alone (e.g. buying a token with ETH)", () => {
    const ethCall = { ...call, value: 1 };
    expect(mergeTokenTransfers([ethCall], [daiIn])).toHaveLength(2);
  });
});

describe("ethereum adapter with tokens and internal transfers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    sharedCache("eth-code-kind").clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const action = new URL(String(input)).searchParams.get("action");
      if (action === "eth_getCode") return json({ result: "0x" });
      if (action === "tokentx") return json(tokenFixture);
      if (action === "txlistinternal") return json(internalFixture);
      return json(txlistFixture);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns native, token and internal movements in one newest-first list", async () => {
    const { transactions } = await createEthereumAdapter("K").fetchTransactions(W);
    const categories = new Set(transactions.map((t) => t.category));
    expect(categories).toContain("token-transfer");
    expect(categories).toContain("internal-transfer");
    expect(transactions.some((t) => t.asset.symbol === "DAI")).toBe(true);
    for (let i = 1; i < transactions.length; i++) {
      expect(transactions[i - 1]!.timestamp).toBeGreaterThanOrEqual(
        transactions[i]!.timestamp,
      );
    }
  });

  it("requests all three Etherscan lists", async () => {
    await createEthereumAdapter("K").fetchTransactions(W);
    const actions = fetchMock.mock.calls.map(([u]) =>
      new URL(String(u)).searchParams.get("action"),
    );
    expect(actions).toEqual(
      expect.arrayContaining(["txlist", "tokentx", "txlistinternal"]),
    );
  });
});

describe("decodeEntities", () => {
  it("unescapes the HTML entities Etherscan puts in token names", async () => {
    const { decodeEntities } = await import("./ethereum");
    expect(decodeEntities("&lt;3")).toBe("<3");
    expect(decodeEntities("Tom &amp; Jerry &quot;TJ&quot; &#39;s")).toBe(
      `Tom & Jerry "TJ" 's`,
    );
    expect(decodeEntities("&copy; untouched")).toBe("&copy; untouched");
  });
});
