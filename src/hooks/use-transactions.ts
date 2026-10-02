"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ApiClientError, apiGet } from "@/lib/api/client";
import {
  transactionsResponseSchema,
  type TransactionsResponse,
} from "@/lib/api/contracts";
import { combinePages } from "@/lib/chains/pages";
import type { Chain } from "@/lib/schemas/chain";
import type { Transaction } from "@/lib/schemas/transaction";

const EMPTY: Transaction[] = [];

export const transactionsQueryKey = (chain: Chain, address: string) =>
  ["transactions", chain, address] as const;

/**
 * A wallet's history as an infinite query: the newest page loads first and
 * `fetchNextPage()` walks back in time. Pages are combined (deduped, Tron
 * token rows re-merged) into one newest-first `transactions` list.
 */
export function useTransactions(
  chain: Chain,
  address: string,
  options: { enabled?: boolean } = {},
) {
  const query = useInfiniteQuery({
    queryKey: transactionsQueryKey(chain, address),
    enabled: options.enabled ?? true,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ chain, address });
      if (pageParam) params.set("cursor", pageParam);
      return apiGet<TransactionsResponse>(
        `/api/transactions?${params}`,
        transactionsResponseSchema,
        { signal },
      );
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Retry only transient failures; a 400 or a rate limit won't fix itself in 1s.
    retry: (failures, err) =>
      failures < 2 && err instanceof ApiClientError && err.isTransient,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const transactions = useMemo(
    () =>
      query.data ? combinePages(query.data.pages.map((p) => p.transactions)) : EMPTY,
    [query.data],
  );
  const first = query.data?.pages[0];

  return {
    ...query,
    transactions,
    /** When the newest page was fetched from the explorer. */
    fetchedAt: first?.fetchedAt,
    cached: first?.cached ?? false,
    pageCount: query.data?.pages.length ?? 0,
  };
}
