import { sharedCache } from "@/lib/cache";
import { makeTx } from "@/test/factories";

import etherscanFixture from "./__fixtures__/etherscan-txlist.json";
import tronFixture from "./__fixtures__/trongrid-account-txs.json";
import { createBitcoinAdapter, DEFAULT_ESPLORA_BASE_URL } from "./bitcoin";
import { createEthereumAdapter, decodeEthCursor, encodeEthCursor } from "./ethereum";
import { combinePages } from "./pages";
import { createTronAdapter, decodeTronCursor, encodeTronCursor } from "./tron";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sharedCache("eth-code-kind").clear();
});
afterEach(() => vi.unstubAllGlobals());

const urlOf = (i: number) => new URL(String(fetchMock.mock.calls[i]![0]));

// ---------------------------------------------------------------- Ethereum
describe("ethereum pagination", () => {
  const ETH_WALLET = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
  const n = etherscanFixture.result.length;
  const EMPTY = { status: "0", message: "No transactions found", result: [] };

  /** Route each Etherscan action to its own fresh response. */
  function route(bodies: Partial<Record<string, unknown>> = {}) {
    return async (input: RequestInfo | URL) => {
      const action = new URL(String(input)).searchParams.get("action")!;
      if (action === "eth_getCode") return json({ result: "0x" });
      return json(bodies[action] ?? (action === "txlist" ? etherscanFixture : EMPTY));
    };
  }

  const pageOf = (action: string) =>
    fetchMock.mock.calls
      .map(([u]) => new URL(String(u)).searchParams)
      .find((p) => p.get("action") === action)
      ?.get("page");

  beforeEach(() => {
    fetchMock.mockImplementation(route());
  });

  it("offers the next page of a list that came back full", async () => {
    const page = await createEthereumAdapter("K").fetchTransactions(ETH_WALLET, {
      limit: n,
    });
    expect(pageOf("txlist")).toBe("1");
    expect(decodeEthCursor(page.nextCursor!)).toEqual({
      normal: 2,
      tokens: null,
      internal: null,
    });
  });

  it("requests each list's own page and skips exhausted lists", async () => {
    const page = await createEthereumAdapter("K").fetchTransactions(ETH_WALLET, {
      limit: n + 5,
      cursor: encodeEthCursor({ normal: 3, tokens: null, internal: 2 })!,
    });
    expect(pageOf("txlist")).toBe("3");
    expect(pageOf("txlistinternal")).toBe("2");
    expect(pageOf("tokentx")).toBeUndefined();
    expect(page.nextCursor).toBeNull();
  });

  it("stops at Etherscan's 10,000-row window", async () => {
    const lastPage = Math.floor(10_000 / n);
    const page = await createEthereumAdapter("K").fetchTransactions(ETH_WALLET, {
      limit: n,
      cursor: encodeEthCursor({ normal: lastPage, tokens: null, internal: null })!,
    });
    expect(page.nextCursor).toBeNull();
  });

  it("keeps a failed enrichment list on the same page so it is retried", async () => {
    fetchMock.mockImplementation(async (input) => {
      const action = new URL(String(input)).searchParams.get("action")!;
      if (action === "tokentx") return new Response("oops", { status: 500 });
      return route()(input);
    });
    const page = await createEthereumAdapter("K").fetchTransactions(ETH_WALLET, {
      limit: n,
    });
    expect(page.transactions).toHaveLength(n); // normal history still renders
    expect(decodeEthCursor(page.nextCursor!).tokens).toBe(1);
  });

  it("treats a garbage cursor as the newest page of every list", async () => {
    await createEthereumAdapter("K").fetchTransactions(ETH_WALLET, { cursor: "abc" });
    expect(pageOf("txlist")).toBe("1");
    expect(pageOf("tokentx")).toBe("1");
    expect(pageOf("txlistinternal")).toBe("1");
  });
});

// ---------------------------------------------------------------- Bitcoin
describe("bitcoin pagination", () => {
  const W = "bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun";

  function esploraTx(id: number, confirmed = true) {
    return {
      txid: `tx${String(id).padStart(4, "0")}`,
      vin: [
        {
          txid: "prev",
          is_coinbase: false,
          prevout: { scriptpubkey_address: "bc1qsender", value: 2000 },
        },
      ],
      vout: [{ scriptpubkey_address: W, value: 1000 }],
      fee: 100,
      status: confirmed
        ? { confirmed: true, block_height: 900_000 - id, block_time: 1_780_000_000 - id }
        : { confirmed: false },
    };
  }
  const batch = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => esploraTx(from + i));

  it("chains up to four Esplora calls per page via /txs/chain/:last_txid", async () => {
    fetchMock.mockImplementation(async (input) => {
      const m = String(input).match(/\/chain\/tx(\d+)$/);
      const after = m ? Number(m[1]) + 1 : 0;
      return json(batch(after, 25));
    });

    const page = await createBitcoinAdapter().fetchTransactions(W);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${DEFAULT_ESPLORA_BASE_URL}/address/${W}/txs`,
    );
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      `${DEFAULT_ESPLORA_BASE_URL}/address/${W}/txs/chain/tx0024`,
    );
    expect(page.transactions).toHaveLength(100);
    expect(page.nextCursor).toBe("tx0099");
  });

  it("resumes from the cursor and ends when Esplora runs dry", async () => {
    fetchMock
      .mockResolvedValueOnce(json(batch(100, 25)))
      .mockResolvedValueOnce(json(batch(125, 3)));

    const page = await createBitcoinAdapter().fetchTransactions(W, { cursor: "tx0099" });
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/txs\/chain\/tx0099$/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(page.transactions).toHaveLength(28);
    expect(page.nextCursor).toBeNull();
  });

  it("doesn't count mempool txs toward a full page", async () => {
    fetchMock.mockResolvedValueOnce(json([esploraTx(0, false), ...batch(1, 24)]));
    const page = await createBitcoinAdapter().fetchTransactions(W);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 24 confirmed < 25 → exhausted
    expect(page.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------- Tron
describe("tron pagination", () => {
  const T = "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy";

  it("round-trips cursors and rejects junk", () => {
    const c = { native: "fpN", trc20: null };
    expect(decodeTronCursor(encodeTronCursor(c)!)).toEqual(c);
    expect(encodeTronCursor({ native: null, trc20: null })).toBeNull();
    expect(decodeTronCursor("not json")).toBeNull();
    expect(decodeTronCursor('{"native":1}')).toBeNull();
  });

  it("builds the next cursor from both lists' fingerprints", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/trc20")
        ? json({ data: [], success: true, meta: { fingerprint: "fpT" } })
        : json({ ...tronFixture, meta: { ...tronFixture.meta, fingerprint: "fpN" } }),
    );
    const page = await createTronAdapter(undefined).fetchTransactions(T);
    expect(decodeTronCursor(page.nextCursor!)).toEqual({ native: "fpN", trc20: "fpT" });
  });

  it("only re-fetches lists that have more, passing their fingerprint", async () => {
    fetchMock.mockResolvedValue(json({ ...tronFixture, meta: { at: 1 } }));
    const page = await createTronAdapter(undefined).fetchTransactions(T, {
      cursor: encodeTronCursor({ native: "fpN", trc20: null })!,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlOf(0).pathname).toMatch(/\/transactions$/);
    expect(urlOf(0).searchParams.get("fingerprint")).toBe("fpN");
    expect(page.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------- combining
describe("combinePages", () => {
  it("drops exact duplicates at page seams and sorts newest first", () => {
    const a = makeTx({ hash: "0xa", timestamp: 3 });
    const b = makeTx({ hash: "0xb", timestamp: 2 });
    const c = makeTx({ hash: "0xc", timestamp: 1 });
    expect(
      combinePages([
        [a, b],
        [b, c],
      ]).map((t) => t.hash),
    ).toEqual(["0xa", "0xb", "0xc"]);
  });

  it("keeps distinct transfers that share a tx hash", () => {
    const usdt = {
      symbol: "USDT",
      contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      decimals: 6,
    };
    const one = makeTx({ hash: "h", asset: usdt, value: 1 });
    const two = makeTx({ hash: "h", asset: usdt, value: 2 });
    expect(combinePages([[one, two]])).toHaveLength(2);
  });

  it("merges a Tron token row with its value-0 call row from another page", () => {
    const call = makeTx({
      chain: "tron",
      hash: "h1",
      asset: { symbol: "TRX", contract: null, decimals: 6 },
      category: "contract-call",
      value: 0,
      fee: 6.5,
      blockHeight: 123,
    });
    const token = makeTx({
      chain: "tron",
      hash: "h1",
      asset: {
        symbol: "USDT",
        contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        decimals: 6,
      },
      category: "token-transfer",
      value: 15,
      fee: null,
      blockHeight: null,
    });
    const merged = combinePages([[call], [token]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ value: 15, fee: 6.5, blockHeight: 123 });
  });
});
