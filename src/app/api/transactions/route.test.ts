import { NextRequest } from "next/server";

import { sharedCache } from "@/lib/cache";
import { UpstreamError } from "@/lib/chains/errors";
import type { TransactionPage } from "@/lib/chains/adapter";
import type { Transaction } from "@/lib/schemas/transaction";

const fetchTransactions =
  vi.fn<(address: string, opts?: unknown) => Promise<TransactionPage>>();

const loadTokenList = vi.fn<() => Promise<Set<string> | null>>();

// Never touch the network from unit tests; annotation itself is tested below.
vi.mock("@/lib/tokens/token-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tokens/token-list")>()),
  loadTokenList: () => loadTokenList(),
}));

vi.mock("@/lib/chains", () => ({
  getAdapter: vi.fn(() => ({ chain: "ethereum", fetchTransactions })),
}));

const { GET } = await import("./route");

const ETH = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const sample: Transaction = {
  chain: "ethereum",
  hash: "0xabc",
  timestamp: 1_789_470_311_000,
  blockHeight: 1,
  from: "0x1",
  to: ETH.toLowerCase(),
  asset: { symbol: "ETH", contract: null, decimals: 18 },
  value: 1,
  fee: null,
  direction: "in",
  status: "success",
  category: "transfer",
  isContract: false,
  method: null,
};

function req(qs: string) {
  return new NextRequest(`http://localhost/api/transactions?${qs}`);
}

describe("GET /api/transactions", () => {
  beforeEach(() => {
    loadTokenList.mockReset();
    loadTokenList.mockResolvedValue(null);
    fetchTransactions.mockReset();
    sharedCache("transactions").clear();
  });

  it("400s on a missing chain", async () => {
    const res = await GET(req(`address=${ETH}`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.issues.some((i: { path: string }) => i.path === "chain")).toBe(
      true,
    );
  });

  it("400s on an address that is invalid for the chain", async () => {
    const res = await GET(req(`chain=bitcoin&address=${ETH}`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.issues[0]).toEqual({
      path: "address",
      message: "Not a valid bitcoin address",
    });
    expect(fetchTransactions).not.toHaveBeenCalled();
  });

  it("400s on an out-of-range limit", async () => {
    const res = await GET(req(`chain=ethereum&address=${ETH}&limit=5000`));
    expect(res.status).toBe(400);
  });

  it("normalizes the address and returns the envelope", async () => {
    fetchTransactions.mockResolvedValue({ transactions: [sample], nextCursor: null });
    const res = await GET(req(`chain=ethereum&address=${ETH}`));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-cache")).toBe("MISS");
    const body = await res.json();
    expect(body.data).toMatchObject({
      chain: "ethereum",
      address: ETH.toLowerCase(),
      transactions: [sample],
      cached: false,
    });
    expect(typeof body.data.fetchedAt).toBe("string");
    expect(fetchTransactions).toHaveBeenCalledWith(ETH.toLowerCase(), {
      limit: 500,
      revalidate: 0,
    });
  });

  it("serves the second identical request from cache", async () => {
    fetchTransactions.mockResolvedValue({ transactions: [sample], nextCursor: null });
    await GET(req(`chain=ethereum&address=${ETH}`));
    const res = await GET(req(`chain=ethereum&address=${ETH.toLowerCase()}`));

    expect(res.headers.get("x-cache")).toBe("HIT");
    expect((await res.json()).data.cached).toBe(true);
    expect(fetchTransactions).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures and maps them to the right status", async () => {
    fetchTransactions.mockRejectedValueOnce(
      new UpstreamError("RATE_LIMITED", "slow", { provider: "etherscan", retryAfter: 3 }),
    );
    const res = await GET(req(`chain=ethereum&address=${ETH}`));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3");

    fetchTransactions.mockResolvedValueOnce({ transactions: [sample], nextCursor: null });
    const retry = await GET(req(`chain=ethereum&address=${ETH}`));
    expect(retry.status).toBe(200);
    expect(retry.headers.get("x-cache")).toBe("MISS");
  });

  it("passes the cursor through, returns nextCursor, and caches each page separately", async () => {
    fetchTransactions.mockImplementation(async (_addr, opts) => {
      const cursor = (opts as { cursor?: string }).cursor;
      return cursor === "2"
        ? { transactions: [{ ...sample, hash: "0xolder" }], nextCursor: null }
        : { transactions: [sample], nextCursor: "2" };
    });

    const first = await (await GET(req(`chain=ethereum&address=${ETH}`))).json();
    expect(first.data.nextCursor).toBe("2");

    const second = await (
      await GET(req(`chain=ethereum&address=${ETH}&cursor=2`))
    ).json();
    expect(second.data.transactions[0].hash).toBe("0xolder");
    expect(second.data.nextCursor).toBeNull();
    expect(fetchTransactions).toHaveBeenLastCalledWith(ETH.toLowerCase(), {
      limit: 500,
      cursor: "2",
      revalidate: 0,
    });

    // first page is still a cache hit
    const again = await GET(req(`chain=ethereum&address=${ETH}`));
    expect(again.headers.get("x-cache")).toBe("HIT");
    expect(fetchTransactions).toHaveBeenCalledTimes(2);
  });

  it("tags token transfers as listed or not, and leaves native rows alone", async () => {
    const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const spam = "0x00000000000000000000000000000000000000ff";
    loadTokenList.mockResolvedValue(new Set([usdc]));
    fetchTransactions.mockResolvedValue({
      transactions: [
        sample,
        {
          ...sample,
          hash: "0xt1",
          asset: { symbol: "USDC", contract: usdc, decimals: 6 },
        },
        {
          ...sample,
          hash: "0xt2",
          asset: { symbol: "SCAM", contract: spam, decimals: 18 },
        },
      ],
      nextCursor: null,
    });
    const body = await (await GET(req(`chain=ethereum&address=${ETH}`))).json();
    const listed = body.data.transactions.map((t: Transaction) => t.asset.listed);
    expect(listed).toEqual([undefined, true, false]);
  });

  it("still serves transactions when the token list can't be loaded", async () => {
    loadTokenList.mockRejectedValue(new Error("list down"));
    fetchTransactions.mockResolvedValue({ transactions: [sample], nextCursor: null });
    const res = await GET(req(`chain=ethereum&address=${ETH}`));
    expect(res.status).toBe(200);
  });
});
