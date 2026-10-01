import { z } from "zod";

import { fetchJson } from "@/lib/chains/http";
import { CHAIN_META, CHAINS, type Chain } from "@/lib/schemas/chain";

const PROVIDER = "coingecko";
const BASE_URL = "https://api.coingecko.com/api/v3";

export const priceQuoteSchema = z.object({
  usd: z.number().nonnegative(),
  /** Percentage, e.g. 4.53 for +4.53%. Null when CoinGecko omits it. */
  change24h: z.number().nullable(),
  /** Unix ms of CoinGecko's last update for this coin. */
  updatedAt: z.number().int().nonnegative().nullable(),
});
export type PriceQuote = z.infer<typeof priceQuoteSchema>;

export const priceMapSchema = z.partialRecord(z.enum(CHAINS), priceQuoteSchema);
export type PriceMap = z.infer<typeof priceMapSchema>;

// --- Upstream shape -------------------------------------------------------

const simplePriceEntry = z.object({
  usd: z.number(),
  usd_24h_change: z.number().optional(),
  last_updated_at: z.number().int().optional(),
});
const simplePriceResponse = z.record(z.string(), simplePriceEntry);

const marketChartResponse = z.object({
  prices: z.array(z.tuple([z.number(), z.number()])),
});

const tokenPriceResponse = z.record(z.string(), z.object({ usd: z.number().optional() }));

/** One point per UTC day: [dayStartMs, usd]. Sorted ascending. */
export const dailyPricesSchema = z.array(
  z.tuple([z.number().int(), z.number().nonnegative()]),
);
export type DailyPrices = z.infer<typeof dailyPricesSchema>;

/** Token contract → USD. Contracts CoinGecko doesn't know are simply absent. */
export const tokenPriceMapSchema = z.record(z.string(), z.number().nonnegative());
export type TokenPriceMap = z.infer<typeof tokenPriceMapSchema>;

const DAY_MS = 24 * 3600 * 1000;

/**
 * CoinGecko's daily series has one point per UTC midnight plus a final
 * "now" point. Collapse to one point per day (last wins) so lookups are a
 * clean binary search over day starts.
 */
export function toDailySeries(points: readonly [number, number][]): DailyPrices {
  const byDay = new Map<number, number>();
  for (const [ts, usd] of points) byDay.set(Math.floor(ts / DAY_MS) * DAY_MS, usd);
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
}

// --- Client ---------------------------------------------------------------

export type PriceClient = {
  fetchPrices(chains?: readonly Chain[]): Promise<PriceMap>;
  /** Last 365 days of daily USD closes — the keyless API's history window. */
  fetchDailyHistory(chain: Chain): Promise<DailyPrices>;
  fetchTokenPrices(chain: Chain, contracts: readonly string[]): Promise<TokenPriceMap>;
};

export function createCoinGeckoClient(apiKey: string | undefined): PriceClient {
  const headers = () => (apiKey ? { "x-cg-demo-api-key": apiKey } : undefined);
  return {
    async fetchPrices(chains = CHAINS) {
      const ids = chains.map((c) => CHAIN_META[c].coingeckoId);
      const params = new URLSearchParams({
        ids: ids.join(","),
        vs_currencies: "usd",
        include_24hr_change: "true",
        include_last_updated_at: "true",
      });

      const data = await fetchJson(`${BASE_URL}/simple/price?${params}`, {
        provider: PROVIDER,
        schema: simplePriceResponse,
        headers: headers(),
        revalidate: 0,
      });

      const out: Partial<PriceMap> = {};
      for (const chain of chains) {
        const entry = data[CHAIN_META[chain].coingeckoId];
        if (!entry) continue;
        out[chain] = {
          usd: entry.usd,
          change24h: entry.usd_24h_change ?? null,
          updatedAt:
            entry.last_updated_at !== undefined ? entry.last_updated_at * 1000 : null,
        };
      }
      return priceMapSchema.parse(out);
    },

    async fetchDailyHistory(chain) {
      const params = new URLSearchParams({
        vs_currency: "usd",
        days: "365",
        interval: "daily",
      });
      const data = await fetchJson(
        `${BASE_URL}/coins/${CHAIN_META[chain].coingeckoId}/market_chart?${params}`,
        {
          provider: PROVIDER,
          schema: marketChartResponse,
          headers: headers(),
          revalidate: 0,
        },
      );
      return toDailySeries(data.prices);
    },

    async fetchTokenPrices(chain, contracts) {
      if (contracts.length === 0) return {};
      const params = new URLSearchParams({
        contract_addresses: contracts.join(","),
        vs_currencies: "usd",
      });
      const data = await fetchJson(
        `${BASE_URL}/simple/token_price/${CHAIN_META[chain].coingeckoPlatform}?${params}`,
        {
          provider: PROVIDER,
          schema: tokenPriceResponse,
          headers: headers(),
          revalidate: 0,
        },
      );
      // CoinGecko echoes EVM contracts lowercased; map back to what we asked for.
      const out: TokenPriceMap = {};
      for (const c of contracts) {
        const hit = data[c] ?? data[c.toLowerCase()];
        if (hit?.usd !== undefined) out[c] = hit.usd;
      }
      return out;
    },
  };
}
