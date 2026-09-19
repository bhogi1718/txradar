import { NextRequest } from "next/server";

import { sharedCache } from "@/lib/cache";
import { UpstreamError } from "@/lib/chains/errors";
import type { Transaction } from "@/lib/schemas/transaction";

const fetchTransactions =
  vi.fn<(address: string, opts?: unknown) => Promise<Transaction[]>>();

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
    fetchTransactions.mockResolvedValue([sample]);
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
    fetchTransactions.mockResolvedValue([sample]);
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

    fetchTransactions.mockResolvedValueOnce([sample]);
    const retry = await GET(req(`chain=ethereum&address=${ETH}`));
    expect(retry.status).toBe(200);
    expect(retry.headers.get("x-cache")).toBe("MISS");
  });
});
