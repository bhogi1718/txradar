import { z } from "zod";

import { getLabel } from "@/lib/labels";
import type { Transaction } from "@/lib/schemas/transaction";

import { counterpartyOf } from "./summary";

export const DIRECTION_FILTERS = ["all", "in", "out", "self"] as const;
export const RANGE_PRESETS = ["24h", "7d", "30d", "90d", "1y", "all"] as const;

export type DirectionFilter = (typeof DIRECTION_FILTERS)[number];
export type RangePreset = (typeof RANGE_PRESETS)[number];

const PRESET_MS: Record<Exclude<RangePreset, "all">, number> = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
  "90d": 90 * 24 * 3600 * 1000,
  "1y": 365 * 24 * 3600 * 1000,
};

/**
 * Filters live in the URL (?dir=in&range=30d&q=0xabc) so a filtered view is
 * shareable and survives reload. Unknown or malformed values fall back to
 * defaults instead of erroring — a bad link should still show something.
 */
export const filterParamsSchema = z.object({
  dir: z.enum(DIRECTION_FILTERS).catch("all"),
  range: z.enum(RANGE_PRESETS).catch("all"),
  q: z
    .string()
    .trim()
    .max(128)
    .catch("")
    .transform((s) => s),
  hideFailed: z
    .enum(["1", "0"])
    .catch("0")
    .transform((v) => v === "1"),
});

export type TxFilters = z.infer<typeof filterParamsSchema>;

export const DEFAULT_FILTERS: TxFilters = filterParamsSchema.parse({});

export function parseFilterParams(params: URLSearchParams): TxFilters {
  return filterParamsSchema.parse({
    dir: params.get("dir") ?? undefined,
    range: params.get("range") ?? undefined,
    q: params.get("q") ?? undefined,
    hideFailed: params.get("hideFailed") ?? undefined,
  });
}

/** Serialize only non-default values so URLs stay short. */
export function serializeFilters(filters: TxFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.dir !== "all") p.set("dir", filters.dir);
  if (filters.range !== "all") p.set("range", filters.range);
  if (filters.q) p.set("q", filters.q);
  if (filters.hideFailed) p.set("hideFailed", "1");
  return p;
}

export function rangeStart(range: RangePreset, now: number = Date.now()): number | null {
  return range === "all" ? null : now - PRESET_MS[range];
}

/** Apply the time window only — used for summary + chart. */
export function filterByRange(
  txs: readonly Transaction[],
  range: RangePreset,
  now: number = Date.now(),
): Transaction[] {
  const from = rangeStart(range, now);
  return from === null ? [...txs] : txs.filter((t) => t.timestamp >= from);
}

/** Apply every filter — used for the table. */
export function applyFilters(
  txs: readonly Transaction[],
  filters: TxFilters,
  now: number = Date.now(),
): Transaction[] {
  const q = filters.q.toLowerCase();
  return filterByRange(txs, filters.range, now).filter((tx) => {
    if (filters.dir !== "all" && tx.direction !== filters.dir) return false;
    if (filters.hideFailed && tx.status === "failed") return false;
    if (q) {
      const cp = counterpartyOf(tx);
      const haystack = [
        tx.hash,
        cp ?? "",
        tx.method ?? "",
        tx.asset.symbol,
        getLabel(tx.chain, cp)?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
