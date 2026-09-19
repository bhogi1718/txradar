import { env } from "@/lib/env";

import { createCoinGeckoClient, type PriceClient } from "./coingecko";

export type { PriceClient, PriceMap, PriceQuote } from "./coingecko";
export { priceMapSchema, priceQuoteSchema } from "./coingecko";

let client: PriceClient | undefined;

export function getPriceClient(): PriceClient {
  client ??= createCoinGeckoClient(env().COINGECKO_API_KEY);
  return client;
}
