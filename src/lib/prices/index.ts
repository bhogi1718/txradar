import { env } from "@/lib/env";

import { createCoinGeckoClient, type PriceClient } from "./coingecko";

export type {
  DailyPrices,
  PriceClient,
  PriceMap,
  PriceQuote,
  TokenPriceMap,
  TokenPricing,
} from "./coingecko";
export {
  dailyPricesSchema,
  priceMapSchema,
  priceQuoteSchema,
  tokenPriceMapSchema,
  tokenPricingSchema,
} from "./coingecko";

let client: PriceClient | undefined;

export function getPriceClient(): PriceClient {
  client ??= createCoinGeckoClient(env().COINGECKO_API_KEY);
  return client;
}
