"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { serializeFilters, type TxFilters } from "@/lib/analytics/filters";

/**
 * Table filters mirrored into the URL query string.
 *
 * The server parses the initial filters from `searchParams` and passes them
 * in, so the page never calls `useSearchParams` — which would force a
 * Suspense boundary whose streamed reveal waits for an animation frame
 * (stalling in background tabs) and adds a fallback flash.
 *
 * The URL is synced in an effect, after render. Next.js routes
 * `history.replaceState` through its router, so calling it inside a state
 * updater would update the Router while WalletView is rendering.
 * `replaceState` (not push) keeps filter tweaks out of the back button.
 */
export function useFilterParams(
  initial: TxFilters,
): [TxFilters, (patch: Partial<TxFilters>) => void] {
  const pathname = usePathname();
  const [filters, setFiltersState] = useState(initial);

  const setFilters = useCallback((patch: Partial<TxFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    const qs = serializeFilters(filters).toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [filters, pathname]);

  return [filters, setFilters];
}
