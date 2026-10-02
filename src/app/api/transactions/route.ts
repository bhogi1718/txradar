import type { NextRequest } from "next/server";

import { transactionsQuerySchema, type TransactionsResponse } from "@/lib/api/contracts";
import { handleError, ok, parseQuery } from "@/lib/api/response";
import { sharedCache } from "@/lib/cache";
import { getAdapter } from "@/lib/chains";
import { annotateListed, loadTokenList } from "@/lib/tokens/token-list";

/** On-chain history only grows; 5 minutes is plenty fresh for a tracker. */
const TTL_MS = 5 * 60 * 1000;

type CachedResult = {
  transactions: TransactionsResponse["transactions"];
  nextCursor: string | null;
  fetchedAt: string;
};

const cache = sharedCache<CachedResult>("transactions", { maxEntries: 500 });

export async function GET(request: NextRequest) {
  const query = parseQuery(request.nextUrl.searchParams, transactionsQuerySchema);
  if (!query.ok) return query.response;

  const { chain, address, limit, cursor } = query.value;
  const key = `${chain}:${address}:${limit}:${cursor ?? ""}`;

  try {
    const { value, hit } = await cache.getOrLoad(key, TTL_MS, async () => {
      const [page, list] = await Promise.all([
        getAdapter(chain).fetchTransactions(address, { limit, cursor, revalidate: 0 }),
        // Spam detection is enrichment: an unavailable list just leaves tokens "unknown".
        loadTokenList(chain).catch(() => null),
      ]);
      return {
        transactions: annotateListed(page.transactions, list),
        nextCursor: page.nextCursor,
        fetchedAt: new Date().toISOString(),
      };
    });

    const body: TransactionsResponse = { chain, address, ...value, cached: hit };
    return ok(body, { maxAge: 60, headers: { "x-cache": hit ? "HIT" : "MISS" } });
  } catch (err) {
    return handleError(err);
  }
}
