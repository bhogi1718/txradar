import type { Chain } from "@/lib/schemas/chain";
import type { Transaction } from "@/lib/schemas/transaction";

export type FetchTransactionsOptions = {
  /** Upper bound on transactions to return. Adapters clamp to provider limits. */
  limit?: number;
  /** Next.js data-cache TTL in seconds; undefined = framework default. */
  revalidate?: number | false;
};

export interface ChainAdapter {
  readonly chain: Chain;
  /**
   * Fetch the most recent transactions for a wallet, newest first, already
   * normalized and validated. `address` must be pre-validated + normalized.
   */
  fetchTransactions(
    address: string,
    options?: FetchTransactionsOptions,
  ): Promise<Transaction[]>;
}

/** Sort newest first; ties broken by hash so ordering is deterministic. */
export function sortNewestFirst(txs: Transaction[]): Transaction[] {
  return [...txs].sort(
    (a, b) => b.timestamp - a.timestamp || a.hash.localeCompare(b.hash),
  );
}
