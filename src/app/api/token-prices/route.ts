import type { NextRequest } from "next/server";

import { tokenPricesQuerySchema, type TokenPricesResponse } from "@/lib/api/contracts";
import { handleError, ok, parseQuery } from "@/lib/api/response";
import { sharedCache } from "@/lib/cache";
import { isUpstreamError } from "@/lib/chains/errors";
import { getPriceClient, type TokenPricing } from "@/lib/prices";
import type { TokenQuote } from "@/lib/prices/coingecko";

const TTL_MS = 5 * 60 * 1000;

/** Per-contract answers: a quote, or null for "CoinGecko has no price". */
const cache = sharedCache<TokenQuote | null>("token-prices", { maxEntries: 1000 });

/**
 * The keyless CoinGecko tier prices one contract per request, so contracts
 * are looked up one at a time and cached individually. Lookups are best
 * effort: a contract that errors is simply left out (the UI shows "price
 * unavailable"), and a rate limit stops the loop instead of making it worse.
 */
export async function GET(request: NextRequest) {
  const query = parseQuery(request.nextUrl.searchParams, tokenPricesQuerySchema);
  if (!query.ok) return query.response;
  const { chain, contracts } = query.value;

  const marketCaps: Record<string, number> = {};
  const pricing: TokenPricing = { prices: {}, unpriced: [], marketCaps };
  let firstError: unknown = null;

  try {
    for (const contract of contracts) {
      try {
        const { value } = await cache.getOrLoad(`${chain}:${contract}`, TTL_MS, () =>
          getPriceClient().fetchTokenPrice(chain, contract),
        );
        if (value === null) {
          pricing.unpriced.push(contract);
        } else {
          pricing.prices[contract] = value.usd;
          if (value.marketCap !== null) marketCaps[contract] = value.marketCap;
        }
      } catch (err) {
        firstError ??= err;
        if (isUpstreamError(err) && err.code === "RATE_LIMITED") break;
      }
    }

    // Nothing known at all: surface the error so the client can back off.
    if (
      firstError &&
      Object.keys(pricing.prices).length === 0 &&
      pricing.unpriced.length === 0
    ) {
      return handleError(firstError);
    }

    const body: TokenPricesResponse = {
      chain,
      pricing,
      fetchedAt: new Date().toISOString(),
    };
    return ok(body, { request, maxAge: 60 });
  } catch (err) {
    return handleError(err);
  }
}
