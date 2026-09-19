import { transactionSchema } from "@/lib/schemas/transaction";

import fixture from "./__fixtures__/esplora-address-txs.json";
import { createBitcoinAdapter, DEFAULT_ESPLORA_BASE_URL } from "./bitcoin";

const WALLET = "bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun";
const SAT = 1e-8;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("bitcoin adapter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(fixture));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("hits the Esplora address endpoint on the configured base URL", async () => {
    await createBitcoinAdapter().fetchTransactions(WALLET);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `${DEFAULT_ESPLORA_BASE_URL}/address/${WALLET}/txs`,
    );

    fetchMock.mockResolvedValue(jsonResponse(fixture));
    await createBitcoinAdapter("https://mempool.space/api/").fetchTransactions(WALLET);
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      `https://mempool.space/api/address/${WALLET}/txs`,
    );
  });

  it("normalizes every fixture tx into the Transaction schema", async () => {
    const txs = await createBitcoinAdapter().fetchTransactions(WALLET);
    expect(txs).toHaveLength(fixture.length);
    for (const tx of txs) expect(transactionSchema.safeParse(tx).success).toBe(true);
  });

  it("classifies a simple inbound payment", async () => {
    const txs = await createBitcoinAdapter().fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("1a2769a203865583"))!;

    expect(tx).toMatchObject({
      chain: "bitcoin",
      direction: "in",
      status: "success",
      category: "transfer",
      to: WALLET,
      fee: null,
      timestamp: 1789510954 * 1000,
    });
    expect(tx.from).not.toBe(WALLET);
    expect(tx.value).toBeCloseTo(330 * SAT, 12);
  });

  it("classifies an outbound payment net of change and fee", async () => {
    // sent 93206, change 15928, to others 77000, fee 278 — wallet funded all inputs
    const txs = await createBitcoinAdapter().fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("1ee0ad5cefc2eb31"))!;

    expect(tx.direction).toBe("out");
    expect(tx.from).toBe(WALLET);
    expect(tx.to).not.toBe(WALLET);
    expect(tx.value).toBeCloseTo(77000 * SAT, 12);
    expect(tx.fee).toBeCloseTo(278 * SAT, 12);
  });

  it("treats a multi-party tx where the wallet gains as inbound by net flow", async () => {
    // wallet spent 330 but received 37643 — a naive 'any input is mine' rule would say 'out'
    const txs = await createBitcoinAdapter().fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("316d9c7bc4aeb81e"))!;

    expect(tx.direction).toBe("in");
    expect(tx.value).toBeCloseTo((37643 - 330) * SAT, 12);
    expect(tx.fee).toBeNull(); // mixed inputs: fee not attributable
  });

  it("classifies consolidation as self and attributes fee when wallet funded it", async () => {
    // 569cdc…: 13 wallet inputs (4974), 2 wallet outputs (4763), nothing to others, fee 211
    const txs = await createBitcoinAdapter().fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("569cdc9eb69d3574"))!;

    expect(tx).toMatchObject({ direction: "self", from: WALLET, to: WALLET });
    expect(tx.value).toBeCloseTo(4763 * SAT, 12);
    expect(tx.fee).toBeCloseTo(211 * SAT, 12);
  });

  it("marks unconfirmed txs pending with a synthetic timestamp and no block", async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const txs = await createBitcoinAdapter().fetchTransactions(WALLET);
    const pending = txs.filter((t) => t.status === "pending");

    expect(pending.map((t) => t.hash.slice(0, 16)).sort()).toEqual(
      ["316d9c7bc4aeb81e", "569cdc9eb69d3574"].sort(),
    );
    for (const tx of pending) {
      expect(tx.blockHeight).toBeNull();
      expect(tx.timestamp).toBe(now);
    }
    // pending sorts to the top since "now" is newer than any confirmed block
    expect(txs[0]!.status).toBe("pending");
  });

  it("propagates HTTP failures as UpstreamError", async () => {
    fetchMock.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));
    await expect(createBitcoinAdapter().fetchTransactions(WALLET)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
