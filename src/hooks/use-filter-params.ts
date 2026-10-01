"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  parseFilterParams,
  serializeFilters,
  type TxFilters,
} from "@/lib/analytics/filters";

/**
 * Table filters backed by the URL query string. `replace` (not `push`) so
 * tweaking a filter doesn't spam the back button with history entries.
 */
export function useFilterParams(): [TxFilters, (patch: Partial<TxFilters>) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(
    () => parseFilterParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setFilters = useCallback(
    (patch: Partial<TxFilters>) => {
      const qs = serializeFilters({ ...filters, ...patch }).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  return [filters, setFilters];
}
