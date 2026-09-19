import { transactionSchema } from "@/lib/schemas/transaction";

import fixture from "./__fixtures__/trongrid-account-txs.json";
import { createTronAdapter } from "./tron";

const WALLET = "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("tron adapter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(fixture));
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
    const txs = await createTronAdapter("KEY").fetchTransactions(WALLET);
    expect(txs).toHaveLength(fixture.data.length);
    for (const tx of txs) expect(transactionSchema.safeParse(tx).success).toBe(true);
  });

  it("decodes hex addresses to base58 and classifies an outbound TRX transfer", async () => {
    const txs = await createTronAdapter("KEY").fetchTransactions(WALLET);
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
    const txs = await createTronAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("b8ab75387e5b"))!;

    expect(tx).toMatchObject({ direction: "in", to: WALLET, fee: null });
    expect(tx.from).toBe("TUwooBpFngoR3BAgPuw7CjiTscJ6LYCXbB");
    expect(tx.value).toBeCloseTo(0.000003, 12);
  });

  it("classifies a smart-contract call against the USDT contract", async () => {
    const txs = await createTronAdapter("KEY").fetchTransactions(WALLET);
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

  it("marks TRC-10 asset transfers as token-transfer with zero native value", async () => {
    const txs = await createTronAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("50650bb4bda2"))!;

    expect(tx).toMatchObject({
      direction: "in",
      category: "token-transfer",
      isContract: false,
      to: WALLET,
      value: 0,
    });
  });

  it("marks non-SUCCESS contractRet as failed with zero value", async () => {
    const failed = structuredClone(fixture);
    failed.data = [failed.data[0]!];
    failed.data[0]!.ret = [{ contractRet: "OUT_OF_ENERGY", fee: 100000 }];
    fetchMock.mockResolvedValue(jsonResponse(failed));

    const [tx] = await createTronAdapter("KEY").fetchTransactions(WALLET);
    expect(tx).toMatchObject({ status: "failed", value: 0 });
  });

  it("does not break on an unknown contract type", async () => {
    const odd = structuredClone(fixture);
    odd.data = [odd.data[0]!];
    odd.data[0]!.raw_data.contract[0]!.type = "FreezeBalanceV2Contract";
    fetchMock.mockResolvedValue(jsonResponse(odd));

    const [tx] = await createTronAdapter("KEY").fetchTransactions(WALLET);
    expect(tx).toMatchObject({ category: "contract-call", value: 0, direction: "out" });
  });
});
