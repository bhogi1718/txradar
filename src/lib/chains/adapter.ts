import type { Chain } from "@/lib/schemas/chain";
import type { Transaction } from "@/lib/schemas/transaction";

export type FetchTransactionsOptions = {
  /** Page size hint. Adapters clamp to what the provider allows. */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`; omit for the newest page. */
  cursor?: string;
  /** Next.js data-cache TTL in seconds; undefined = framework default. */
  revalidate?: number | false;
};

export type TransactionPage = {
  /** Newest first, normalized and validated. */
  transactions: Transaction[];
  /** Pass back as `cursor` to fetch older history; null when there is none. */
  nextCursor: string | null;
};

export interface ChainAdapter {
  readonly chain: Chain;
  /**
   * Fetch one page of a wallet's history, newest first. `address` must be
   * pre-validated + normalized. Cursors are adapter-specific and opaque to
   * callers: a page number (Etherscan), a txid (Esplora), or fingerprints
   * (TronGrid).
   */
  fetchTransactions(
    address: string,
    options?: FetchTransactionsOptions,
  ): Promise<TransactionPage>;
}

/** Sort newest first; ties broken by hash so ordering is deterministic. */
export function sortNewestFirst(txs: Transaction[]): Transaction[] {
  return [...txs].sort(
    (a, b) => b.timestamp - a.timestamp || a.hash.localeCompare(b.hash),
  );
}
