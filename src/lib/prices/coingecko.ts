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

// --- Client ---------------------------------------------------------------

export type PriceClient = {
  fetchPrices(chains?: readonly Chain[]): Promise<PriceMap>;
};

export function createCoinGeckoClient(apiKey: string | undefined): PriceClient {
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
        headers: apiKey ? { "x-cg-demo-api-key": apiKey } : undefined,
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
  };
}
