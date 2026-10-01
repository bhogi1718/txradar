"use client";

import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api/client";
import {
  priceHistoryResponseSchema,
  TOKEN_PRICES_MAX_CONTRACTS,
  tokenPricesResponseSchema,
  type PriceHistoryResponse,
  type TokenPricesResponse,
} from "@/lib/api/contracts";
import type { Chain } from "@/lib/schemas/chain";

/** Daily native-coin closes for the last year. Decoration: never retried hard. */
export function usePriceHistory(chain: Chain) {
  return useQuery<PriceHistoryResponse, Error>({
    queryKey: ["price-history", chain],
    queryFn: ({ signal }) =>
      apiGet(`/api/price-history?chain=${chain}`, priceHistoryResponseSchema, { signal }),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

/** Current USD prices for the token contracts a wallet touched. */
export function useTokenPrices(chain: Chain, contracts: readonly string[]) {
  const list = contracts.slice(0, TOKEN_PRICES_MAX_CONTRACTS);
  return useQuery<TokenPricesResponse, Error>({
    queryKey: ["token-prices", chain, list],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ chain, contracts: list.join(",") });
      return apiGet(`/api/token-prices?${params}`, tokenPricesResponseSchema, { signal });
    },
    enabled: list.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
