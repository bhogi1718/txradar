import { isNative, type Transaction } from "@/lib/schemas/transaction";

import { sortNewestFirst } from "./adapter";
import { mergeTokenTransfers } from "./tron";

/** Identity of one ledger movement: a tx can carry several transfers. */
function movementKey(tx: Transaction): string {
  return `${tx.hash}|${tx.asset.contract ?? "native"}|${tx.direction}|${tx.from}|${tx.to}|${tx.value}`;
}

/**
 * Combine pages of one wallet's history into a single newest-first list.
 *
 * Pages from cursor-based APIs can overlap at the seams (new txs arriving
 * between requests shift the window), so exact duplicates are dropped. On
 * Tron, a TRC-20 send's token row and its value-0 contract-call row can land
 * on different pages; re-running the merge collapses those pairs too.
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

  const tron = unique.filter((t) => t.chain === "tron");
  if (tron.length > 0) {
    const others = unique.filter((t) => t.chain !== "tron");
    const merged = mergeTokenTransfers(
      tron.filter((t) => isNative(t)),
      tron.filter((t) => !isNative(t)),
    );
    return sortNewestFirst([...others, ...merged]);
  }
  return sortNewestFirst(unique);
}
