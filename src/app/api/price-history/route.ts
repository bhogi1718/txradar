import type { NextRequest } from "next/server";

import { priceHistoryQuerySchema, type PriceHistoryResponse } from "@/lib/api/contracts";
import { handleError, ok, parseQuery } from "@/lib/api/response";
import { sharedCache } from "@/lib/cache";
import { getPriceClient, type DailyPrices } from "@/lib/prices";

/** Daily closes only change once a day; a few hours is generous. */
const TTL_MS = 6 * 3600 * 1000;

type CachedResult = { prices: DailyPrices; fetchedAt: string };

const cache = sharedCache<CachedResult>("price-history", { maxEntries: 8 });

export async function GET(request: NextRequest) {
  const query = parseQuery(request.nextUrl.searchParams, priceHistoryQuerySchema);
  if (!query.ok) return query.response;
  const { chain } = query.value;

  try {
    const { value, hit } = await cache.getOrLoad(chain, TTL_MS, async () => ({
      prices: await getPriceClient().fetchDailyHistory(chain),
      fetchedAt: new Date().toISOString(),
    }));
    const body: PriceHistoryResponse = { chain, ...value, cached: hit };
    return ok(body, {
      request,
      maxAge: 3600,
      headers: { "x-cache": hit ? "HIT" : "MISS" },
    });
  } catch (err) {
    return handleError(err);
  }
}
