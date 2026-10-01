"use client";

import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api/client";
import { pricesResponseSchema, type PricesResponse } from "@/lib/api/contracts";

export function usePrices() {
  return useQuery<PricesResponse, Error>({
    queryKey: ["prices"],
    queryFn: ({ signal }) => apiGet("/api/prices", pricesResponseSchema, { signal }),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    // Prices are decoration; never block or spam on failure.
    retry: 1,
  });
}
