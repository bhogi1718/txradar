import { transactionSchema } from "@/lib/schemas/transaction";

import fixture from "./__fixtures__/trongrid-account-txs.json";
import trc20Fixture from "./__fixtures__/trongrid-trc20.json";
import { createTronAdapter, mergeTokenTransfers } from "./tron";

const WALLET = "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const EMPTY_TRC20 = { data: [], success: true, meta: {} };

/** Route the native list and the TRC-20 list to their own bodies. */
function routeFetch(native: unknown = fixture, trc20: unknown = EMPTY_TRC20) {
  return async (input: RequestInfo | URL) =>
    String(input).includes("/transactions/trc20")
      ? jsonResponse(trc20)
      : jsonResponse(native);
}

describe("tron adapter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(routeFetch());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requests TronGrid confirmed txs newest first, with the key header when set", async () => {
    await createTronAdapter("KEY").fetchTransactions(WALLET, { limit: 500 });
    const [url, init] = fetchMock.mock.calls[0]!;
    const u = new URL(String(url));

    expect(u.origin + u.pathname).toBe(
      `https://api.trongrid.io/v1/accounts/${WALLET}/transactions`,
    );
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      limit: "200", // clamped to provider max
      order_by: "block_timestamp,desc",
      only_confirmed: "true",
    });
    expect(init?.headers).toMatchObject({ "TRON-PRO-API-KEY": "KEY" });
  });

  it("omits the key header when no key is configured", async () => {
    await createTronAdapter(undefined).fetchTransactions(WALLET);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.headers).not.toHaveProperty("TRON-PRO-API-KEY");
  });

  it("normalizes every fixture tx into the Transaction schema", async () => {
    const { transactions: txs } =
      await createTronAdapter("KEY").fetchTransactions(WALLET);
    expect(txs).toHaveLength(fixture.data.length);
    for (const tx of txs) expect(transactionSchema.safeParse(tx).success).toBe(true);
  });

  it("decodes hex addresses to base58 and classifies an outbound TRX transfer", async () => {
    const { transactions: txs } =
      await createTronAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("49ca73162b95"))!;

    expect(tx).toMatchObject({
      chain: "tron",
      direction: "out",
      category: "transfer",
      isContract: false,
      status: "success",
      from: WALLET,
      to: "TFuie5eH4QnpMCTXbFCd9RCFoUdNnSCPiJ",
      value: 1,
      timestamp: 1789661808000,
      blockHeight: 86329873,
    });
    expect(tx.fee).toBeCloseTo(0.267, 12);
  });

  it("classifies an inbound TRX transfer with no fee attributed", async () => {
    const { transactions: txs } =
      await createTronAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("b8ab75387e5b"))!;

    expect(tx).toMatchObject({ direction: "in", to: WALLET, fee: null });
    expect(tx.from).toBe("TUwooBpFngoR3BAgPuw7CjiTscJ6LYCXbB");
    expect(tx.value).toBeCloseTo(0.000003, 12);
  });

  it("classifies a smart-contract call against the USDT contract", async () => {
    const { transactions: txs } =
      await createTronAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("bab10a1da23e"))!;

    expect(tx).toMatchObject({
      direction: "out",
      category: "contract-call",
      isContract: true,
      to: USDT_CONTRACT,
      value: 0,
      method: "TriggerSmartContract",
    });
    expect(tx.fee).toBeCloseTo(6.4285, 12);
  });

  it("models TRC-10 transfers as their own raw-unit asset", async () => {
    const { transactions: txs } =
      await createTronAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("50650bb4bda2"))!;

    expect(tx).toMatchObject({
      direction: "in",
      category: "token-transfer",
      isContract: false,
      to: WALLET,
      value: 4444444444,
      asset: { symbol: "TRC-10 #1005193", contract: "trc10:1005193", decimals: 0 },
    });
  });

  it("marks non-SUCCESS contractRet as failed with zero value", async () => {
    const failed = structuredClone(fixture);
    failed.data = [failed.data[0]!];
    failed.data[0]!.ret = [{ contractRet: "OUT_OF_ENERGY", fee: 100000 }];
    fetchMock.mockImplementation(routeFetch(failed));

    const {
      transactions: [tx],
    } = await createTronAdapter("KEY").fetchTransactions(WALLET);
    expect(tx).toMatchObject({ status: "failed", value: 0 });
  });

  it("does not break on an unknown contract type", async () => {
    const odd = structuredClone(fixture);
    odd.data = [odd.data[0]!];
    odd.data[0]!.raw_data.contract[0]!.type = "FreezeBalanceV2Contract";
    fetchMock.mockImplementation(routeFetch(odd));

    const {
      transactions: [tx],
    } = await createTronAdapter("KEY").fetchTransactions(WALLET);
    expect(tx).toMatchObject({ category: "contract-call", value: 0, direction: "out" });
  });

  describe("TRC-20 tokens", () => {
    it("requests the TRC-20 list alongside native history", async () => {
      await createTronAdapter("KEY").fetchTransactions(WALLET);
      const urls = fetchMock.mock.calls.map(([u]) => new URL(String(u)).pathname);
      expect(urls).toContain(`/v1/accounts/${WALLET}/transactions`);
      expect(urls).toContain(`/v1/accounts/${WALLET}/transactions/trc20`);
    });

    it("collapses a USDT send into one token row that keeps the native fee", async () => {
      fetchMock.mockImplementation(routeFetch(fixture, trc20Fixture));
      const { transactions: txs } =
        await createTronAdapter("KEY").fetchTransactions(WALLET);
      const rows = txs.filter((t) => t.hash.startsWith("bab10a1da23e"));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: "token-transfer",
        direction: "out",
        value: 1,
        asset: { symbol: "USDT", contract: USDT_CONTRACT, decimals: 6 },
        blockHeight: 85085414,
        to: trc20Fixture.data[0]!.to,
      });
      expect(rows[0]!.fee).toBeCloseTo(6.4285, 12);
    });

    it("adds incoming token transfers that have no native row, with no fee", async () => {
      fetchMock.mockImplementation(routeFetch(fixture, trc20Fixture));
      const { transactions: txs } =
        await createTronAdapter("KEY").fetchTransactions(WALLET);
      const tx = txs.find((t) => t.hash.startsWith("34459841ec72"))!;
      expect(tx).toMatchObject({
        direction: "in",
        value: 2,
        fee: null,
        blockHeight: null,
      });
      expect(tx.asset.symbol).toBe("USDT");
    });

    it("keeps native history when the TRC-20 request fails", async () => {
      fetchMock.mockImplementation(async (input) => {
        if (String(input).includes("/trc20")) return new Response("{}", { status: 500 });
        return jsonResponse(fixture);
      });
      const { transactions: txs } =
        await createTronAdapter("KEY").fetchTransactions(WALLET);
      expect(txs).toHaveLength(fixture.data.length);
    });

    it("does not absorb a native row that carried value", () => {
      const native = [
        { ...baseTx(), hash: "h1", category: "contract-call" as const, value: 5 },
      ];
      const tokens = [
        { ...baseTx(), hash: "h1", category: "token-transfer" as const, value: 1 },
      ];
      expect(mergeTokenTransfers(native, tokens)).toHaveLength(2);
    });
  });
});

function baseTx() {
  return {
    chain: "tron" as const,
    hash: "h",
    timestamp: 1,
    blockHeight: 1,
    from: WALLET,
    to: USDT_CONTRACT,
    asset: { symbol: "TRX", contract: null, decimals: 6 },
    value: 0,
    fee: 1,
    direction: "out" as const,
    status: "success" as const,
    category: "contract-call" as const,
    isContract: true,
    method: null,
  };
}
