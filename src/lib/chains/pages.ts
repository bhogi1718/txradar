import { isNative, type Transaction } from "@/lib/schemas/transaction";

import { sortNewestFirst } from "./adapter";
import { mergeTokenTransfers } from "./merge";

/** Identity of one ledger movement: a tx can carry several transfers. */
function movementKey(tx: Transaction): string {
  return `${tx.hash}|${tx.asset.contract ?? "native"}|${tx.direction}|${tx.from}|${tx.to}|${tx.value}`;
}

/**
 * Combine pages of one wallet's history into a single newest-first list.
 *
 * Pages from cursor-based APIs can overlap at the seams (new txs arriving
 * between requests shift the window), so exact duplicates are dropped. A
 * token send's token row and its value-0 contract-call row can land on
 * different pages (separate upstream lists); re-running the merge collapses
 * those pairs too.
 */
export function combinePages(pages: readonly (readonly Transaction[])[]): Transaction[] {
  const seen = new Set<string>();
  const unique: Transaction[] = [];
  for (const page of pages) {
    for (const tx of page) {
      const key = movementKey(tx);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(tx);
    }
  }

  // A wallet's pages are all one chain, but stay correct if they ever aren't.
  const byChain = new Map<string, Transaction[]>();
  for (const tx of unique) {
    const list = byChain.get(tx.chain) ?? [];
    list.push(tx);
    byChain.set(tx.chain, list);
  }
  const merged = [...byChain.values()].flatMap((list) =>
    mergeTokenTransfers(
      list.filter((t) => isNative(t)),
      list.filter((t) => !isNative(t)),
    ),
  );
  return sortNewestFirst(merged);
}
