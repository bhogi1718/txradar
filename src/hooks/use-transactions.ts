"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiClientError, apiGet } from "@/lib/api/client";
import {
  transactionsResponseSchema,
  type TransactionsResponse,
} from "@/lib/api/contracts";
import type { Chain } from "@/lib/schemas/chain";

export const transactionsQueryKey = (chain: Chain, address: string) =>
  ["transactions", chain, address] as const;

export function useTransactions(chain: Chain, address: string) {
  return useQuery<TransactionsResponse, Error>({
    queryKey: transactionsQueryKey(chain, address),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ chain, address });
      return apiGet(`/api/transactions?${params}`, transactionsResponseSchema, {
        signal,
      });
    },
    // Retry only transient failures; a 400 or a rate limit won't fix itself in 1s.
    retry: (failures, err) =>
      failures < 2 && err instanceof ApiClientError && err.isTransient,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
