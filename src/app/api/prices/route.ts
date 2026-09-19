import type { PricesResponse } from "@/lib/api/contracts";
import { handleError, ok } from "@/lib/api/response";
import { sharedCache } from "@/lib/cache";
import { getPriceClient, type PriceMap } from "@/lib/prices";

/** CoinGecko refreshes roughly every minute; keyless tier allows ~30 req/min. */
const TTL_MS = 60 * 1000;

type CachedResult = { prices: PriceMap; fetchedAt: string };

const cache = sharedCache<CachedResult>("prices", { maxEntries: 4 });

export async function GET() {
  try {
    const { value, hit } = await cache.getOrLoad("all", TTL_MS, async () => ({
      prices: await getPriceClient().fetchPrices(),
      fetchedAt: new Date().toISOString(),
    }));

    const body: PricesResponse = { ...value, cached: hit };
    return ok(body, { maxAge: 30, headers: { "x-cache": hit ? "HIT" : "MISS" } });
  } catch (err) {
    return handleError(err);
  }
}
