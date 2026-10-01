import { isNative, type Transaction } from "@/lib/schemas/transaction";

export type WalletSummary = {
  /** Native units received (successful native `in` txs; tokens are summarized separately). */
  inflow: number;
  /** Native units sent to others (successful `out` txs only). */
  outflow: number;
  /** inflow − outflow − fees. What the wallet gained or lost over the window. */
  net: number;
  /** Fees the wallet itself paid, including on failed txs. */
  fees: number;
  counts: {
    total: number;
    in: number;
    out: number;
    self: number;
    failed: number;
    pending: number;
  };
  /** Distinct addresses the wallet exchanged value with. */
  counterparties: number;
  /** Timestamps of oldest / newest tx in the set; null when empty. */
  firstSeen: number | null;
  lastSeen: number | null;
};

export function counterpartyOf(tx: Transaction): string | null {
  if (tx.direction === "self") return null;
  return tx.direction === "in" ? tx.from : tx.to;
}

/**
 * Aggregate a set of already-normalized transactions. Failed txs count
 * toward `failed` and `fees` (gas is burned regardless) but never toward
 * inflow/outflow — their value never moved. Token transfers count toward
 * `counts` and pay native `fees`, but their amounts are in other units and
 * are left to `summarizeTokens`.
 */
export function summarize(txs: readonly Transaction[]): WalletSummary {
  let inflow = 0;
  let outflow = 0;
  let fees = 0;
  const counts = { total: txs.length, in: 0, out: 0, self: 0, failed: 0, pending: 0 };
  const parties = new Set<string>();
  let firstSeen: number | null = null;
  let lastSeen: number | null = null;

  for (const tx of txs) {
    counts[tx.direction] += 1;
    if (tx.status === "failed") counts.failed += 1;
    if (tx.status === "pending") counts.pending += 1;
    if (tx.fee !== null) fees += tx.fee;

    if (tx.status !== "failed" && isNative(tx)) {
      if (tx.direction === "in") inflow += tx.value;
      else if (tx.direction === "out") outflow += tx.value;
    }

    const cp = counterpartyOf(tx);
    if (cp) parties.add(cp);

    firstSeen = firstSeen === null ? tx.timestamp : Math.min(firstSeen, tx.timestamp);
    lastSeen = lastSeen === null ? tx.timestamp : Math.max(lastSeen, tx.timestamp);
  }

  return {
    inflow,
    outflow,
    net: inflow - outflow - fees,
    fees,
    counts,
    counterparties: parties.size,
    firstSeen,
    lastSeen,
  };
}
