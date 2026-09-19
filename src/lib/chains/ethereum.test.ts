import { transactionSchema } from "@/lib/schemas/transaction";

import fixture from "./__fixtures__/etherscan-txlist.json";
import { UpstreamError } from "./errors";
import { createEthereumAdapter } from "./ethereum";

const WALLET = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("ethereum adapter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requests Etherscan V2 with the key, newest first", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    await createEthereumAdapter("KEY").fetchTransactions(WALLET, { limit: 50 });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.etherscan.io/v2/api");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      chainid: "1",
      module: "account",
      action: "txlist",
      address: WALLET,
      sort: "desc",
      offset: "50",
      apikey: "KEY",
    });
  });

  it("normalizes every fixture tx into the Transaction schema", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const txs = await createEthereumAdapter("KEY").fetchTransactions(WALLET);

    expect(txs).toHaveLength(fixture.result.length);
    for (const tx of txs) expect(transactionSchema.safeParse(tx).success).toBe(true);
    // newest first
    for (let i = 1; i < txs.length; i++)
      expect(txs[i - 1]!.timestamp).toBeGreaterThanOrEqual(txs[i]!.timestamp);
  });

  it("classifies a plain inbound transfer", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const txs = await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("0xd81ea91807"))!;

    expect(tx).toMatchObject({
      chain: "ethereum",
      direction: "in",
      category: "transfer",
      isContract: false,
      status: "success",
      to: WALLET,
      from: "0xc8ae0c21ebec16de7ce800347c3e96188d0df469",
      fee: null,
      method: null,
      blockHeight: 25982448,
      timestamp: 1789470311 * 1000,
    });
    expect(tx.value).toBeCloseTo(0.00001, 12);
  });

  it("classifies an outbound contract call with method name and fee", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const txs = await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("0xc9068313b1"))!;
    const raw = fixture.result.find((t) => t.hash === tx.hash)!;

    expect(tx).toMatchObject({
      direction: "out",
      category: "contract-call",
      isContract: true,
      method: "setContenthash",
      from: WALLET,
      value: 0,
    });
    const expectedFee = Number(BigInt(raw.gasUsed) * BigInt(raw.gasPrice)) / 1e18;
    expect(tx.fee).toBeCloseTo(expectedFee, 12);
  });

  it("flags inbound calls with calldata as contract interactions", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const txs = await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("0xfd9dfbf103"))!;
    expect(tx).toMatchObject({
      direction: "in",
      category: "contract-call",
      isContract: true,
      method: null,
    });
  });

  it("zeroes value on a failed tx but keeps it in the list", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture));
    const txs = await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("0x42b6fe480a"))!;
    expect(tx.status).toBe("failed");
    expect(tx.value).toBe(0);
  });

  it("treats 'No transactions found' as an empty list", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "0", message: "No transactions found", result: [] }),
    );
    await expect(createEthereumAdapter("KEY").fetchTransactions(WALLET)).resolves.toEqual(
      [],
    );
  });

  it("maps Etherscan's in-band rate limit message to RATE_LIMITED", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "0", message: "NOTOK", result: "Max rate limit reached" }),
    );
    await expect(
      createEthereumAdapter("KEY").fetchTransactions(WALLET),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("surfaces other in-band errors as UPSTREAM_ERROR", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "0", message: "NOTOK", result: "Invalid API Key" }),
    );
    const err = await createEthereumAdapter("KEY")
      .fetchTransactions(WALLET)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).message).toMatch(/Invalid API Key/);
  });

  it("fails fast without an API key and never calls fetch", async () => {
    await expect(
      createEthereumAdapter(undefined).fetchTransactions(WALLET),
    ).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
