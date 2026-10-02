"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { serializeFilters, type TxFilters } from "@/lib/analytics/filters";

/**
 * Table filters mirrored into the URL query string.
 *
 * The server parses the initial filters from `searchParams` and passes them
 * in, so the page never calls `useSearchParams` — which would force a
 * Suspense boundary whose streamed reveal waits for an animation frame
 * (stalling in background tabs) and adds a fallback flash. Updates go
 * through `history.replaceState`, which Next.js syncs with its router
 * without a server round trip, and which doesn't add history entries.
 */
export function useFilterParams(
  initial: TxFilters,
): [TxFilters, (patch: Partial<TxFilters>) => void] {
  const pathname = usePathname();
  const [filters, setFiltersState] = useState(initial);

  const setFilters = useCallback(
    (patch: Partial<TxFilters>) => {
      setFiltersState((prev) => {
        const next = { ...prev, ...patch };
        const qs = serializeFilters(next).toString();
        window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
        return next;
      });
    },
    [pathname],
  );

  return [filters, setFilters];
}
