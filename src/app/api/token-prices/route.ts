import type { NextRequest } from "next/server";

import { tokenPricesQuerySchema, type TokenPricesResponse } from "@/lib/api/contracts";
import { handleError, ok, parseQuery } from "@/lib/api/response";
import { sharedCache } from "@/lib/cache";
import { getPriceClient, type TokenPriceMap } from "@/lib/prices";

const TTL_MS = 5 * 60 * 1000;

type CachedResult = { prices: TokenPriceMap; fetchedAt: string };

const cache = sharedCache<CachedResult>("token-prices", { maxEntries: 200 });

export async function GET(request: NextRequest) {
  const query = parseQuery(request.nextUrl.searchParams, tokenPricesQuerySchema);
  if (!query.ok) return query.response;
  const { chain, contracts } = query.value;

  try {
    const { value, hit } = await cache.getOrLoad(
      `${chain}:${contracts.join(",")}`,
      TTL_MS,
      async () => ({
        prices: await getPriceClient().fetchTokenPrices(chain, contracts),
        fetchedAt: new Date().toISOString(),
      }),
    );
    const body: TokenPricesResponse = { chain, ...value, cached: hit };
    return ok(body, { maxAge: 60, headers: { "x-cache": hit ? "HIT" : "MISS" } });
  } catch (err) {
    return handleError(err);
  }
}
