import type { NextRequest } from "next/server";

import { transactionsQuerySchema, type TransactionsResponse } from "@/lib/api/contracts";
import { handleError, ok, parseQuery } from "@/lib/api/response";
import { sharedCache } from "@/lib/cache";
import { getAdapter } from "@/lib/chains";

/** On-chain history only grows; 5 minutes is plenty fresh for a tracker. */
const TTL_MS = 5 * 60 * 1000;

type CachedResult = {
  transactions: TransactionsResponse["transactions"];
  fetchedAt: string;
};

const cache = sharedCache<CachedResult>("transactions", { maxEntries: 200 });

export async function GET(request: NextRequest) {
  const query = parseQuery(request.nextUrl.searchParams, transactionsQuerySchema);
  if (!query.ok) return query.response;

  const { chain, address, limit } = query.value;
  const key = `${chain}:${address}:${limit}`;

  try {
    const { value, hit } = await cache.getOrLoad(key, TTL_MS, async () => ({
      transactions: await getAdapter(chain).fetchTransactions(address, {
        limit,
        revalidate: 0,
      }),
      fetchedAt: new Date().toISOString(),
    }));

    const body: TransactionsResponse = { chain, address, ...value, cached: hit };
    return ok(body, { maxAge: 60, headers: { "x-cache": hit ? "HIT" : "MISS" } });
  } catch (err) {
    return handleError(err);
  }
}
