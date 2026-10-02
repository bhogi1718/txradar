import { transactionSchema } from "@/lib/schemas/transaction";

import { sharedCache } from "@/lib/cache";

import fixture from "./__fixtures__/etherscan-txlist.json";
import { UpstreamError } from "./errors";
import {
  addressesNeedingCodeCheck,
  classifyCode,
  createEthereumAdapter,
  normalizeEtherscanTx,
} from "./ethereum";

const WALLET = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** Vitalik's live code: an EIP-7702 delegation designator, i.e. still a wallet. */
const DELEGATED_CODE = "0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d";

/** Route txlist to the fixture and eth_getCode to a per-address answer. */
function routeFetch(codeFor: (address: string) => string = () => DELEGATED_CODE) {
  return async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.searchParams.get("action") === "eth_getCode") {
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: codeFor(url.searchParams.get("address")!),
      });
    }
    return jsonResponse(fixture);
  };
}

describe("ethereum adapter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(routeFetch());
    sharedCache("eth-code-kind").clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requests Etherscan V2 with the key, newest first", async () => {
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
    const { transactions: txs } =
      await createEthereumAdapter("KEY").fetchTransactions(WALLET);

    expect(txs).toHaveLength(fixture.result.length);
    for (const tx of txs) expect(transactionSchema.safeParse(tx).success).toBe(true);
    // newest first
    for (let i = 1; i < txs.length; i++)
      expect(txs[i - 1]!.timestamp).toBeGreaterThanOrEqual(txs[i]!.timestamp);
  });

  it("classifies a plain inbound transfer", async () => {
    const { transactions: txs } =
      await createEthereumAdapter("KEY").fetchTransactions(WALLET);
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
    const { transactions: txs } =
      await createEthereumAdapter("KEY").fetchTransactions(WALLET);
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

  it("treats calldata sent to a wallet as a transfer with a memo, not a contract call", async () => {
    const { transactions: txs } =
      await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("0xfd9dfbf103"))!;
    expect(tx).toMatchObject({
      direction: "in",
      category: "transfer",
      isContract: false,
    });
  });

  it("checks the wallet's code once and caches it across scans", async () => {
    await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    const codeCalls = fetchMock.mock.calls.filter(
      ([u]) => new URL(String(u)).searchParams.get("action") === "eth_getCode",
    );
    expect(codeCalls).toHaveLength(1);
    expect(new URL(String(codeCalls[0]![0])).searchParams.get("address")).toBe(WALLET);
  });

  it("classifies incoming calldata as a contract call when the wallet is a contract", async () => {
    fetchMock.mockImplementation(routeFetch(() => "0x6080604052"));
    const { transactions: txs } =
      await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("0xfd9dfbf103"))!;
    expect(tx.category).toBe("contract-call");
  });

  it("still returns data when code lookups fail", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("action") === "eth_getCode")
        throw new TypeError("fetch failed");
      return jsonResponse(fixture);
    });
    const { transactions: txs } =
      await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    expect(txs).toHaveLength(fixture.result.length);
  });

  it("zeroes value on a failed tx but keeps it in the list", async () => {
    const { transactions: txs } =
      await createEthereumAdapter("KEY").fetchTransactions(WALLET);
    const tx = txs.find((t) => t.hash.startsWith("0x42b6fe480a"))!;
    expect(tx.status).toBe("failed");
    expect(tx.value).toBe(0);
  });

  it("treats 'No transactions found' as an empty list", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "0", message: "No transactions found", result: [] }),
    );
    await expect(createEthereumAdapter("KEY").fetchTransactions(WALLET)).resolves.toEqual(
      { transactions: [], nextCursor: null },
    );
  });

  it("maps Etherscan's in-band rate limit message to RATE_LIMITED", async () => {
    fetchMock.mockReset();
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
    fetchMock.mockReset();
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

describe("classifyCode", () => {
  it("treats empty code as a wallet", () => {
    expect(classifyCode("0x")).toBe("wallet");
    expect(classifyCode("")).toBe("wallet");
  });

  it("treats an EIP-7702 delegation designator as a wallet", () => {
    expect(classifyCode(DELEGATED_CODE)).toBe("wallet");
    expect(classifyCode(DELEGATED_CODE.toUpperCase().replace("0X", "0x"))).toBe("wallet");
  });

  it("treats real bytecode as a contract, including code that merely starts with ef01", () => {
    expect(classifyCode("0x6080604052348015600f57600080fd5b50")).toBe("contract");
    expect(classifyCode(DELEGATED_CODE + "00")).toBe("contract");
  });
});

describe("addressesNeedingCodeCheck", () => {
  it("asks only about the wallet (incoming calldata) and undecoded outgoing targets", () => {
    const base = fixture.result[0]!;
    const decodedOut = {
      ...base,
      from: WALLET,
      to: "0xaaa",
      input: "0x12345678",
      functionName: "f()",
    };
    const undecodedOut = {
      ...base,
      from: WALLET,
      to: "0xBBB",
      input: "0x12345678",
      functionName: "",
    };
    const plainOut = {
      ...base,
      from: WALLET,
      to: "0xccc",
      input: "0x",
      functionName: "",
    };
    const inWithData = {
      ...base,
      from: "0xddd",
      to: WALLET,
      input: "0x12345678",
      functionName: "",
    };

    expect(
      addressesNeedingCodeCheck(
        [decodedOut, undecodedOut, plainOut, inWithData],
        WALLET,
      ).sort(),
    ).toEqual(["0xbbb", WALLET].sort());
  });

  it("classifies an undecoded outgoing call to a wallet as a transfer", () => {
    const base = fixture.result[0]!;
    const tx = {
      ...base,
      from: WALLET,
      to: "0xbbb",
      input: "0x12345678",
      functionName: "",
    };
    expect(
      normalizeEtherscanTx(tx, WALLET, new Map([["0xbbb", "wallet"]])).category,
    ).toBe("transfer");
    expect(
      normalizeEtherscanTx(tx, WALLET, new Map([["0xbbb", "contract"]])).category,
    ).toBe("contract-call");
    expect(normalizeEtherscanTx(tx, WALLET).category).toBe("contract-call"); // unknown → heuristic
  });
});
