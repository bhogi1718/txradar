import { sameAddress } from "@/lib/chains/address";
import { getLabel, type AddressLabel } from "@/lib/labels";
import { isNative, type Transaction } from "@/lib/schemas/transaction";

import { counterpartyOf } from "./summary";

export type CounterpartySummary = {
  address: string;
  label: AddressLabel | null;
  count: number;
  /** Native coin received from / sent to this counterparty. */
  inflow: number;
  outflow: number;
  /** inflow − outflow, from the tracked wallet's side. */
  net: number;
  /** Token transfers (amounts are per token, so only counted). */
  tokenTransfers: number;
  firstSeen: number;
  lastSeen: number;
};

/**
 * Everyone the wallet exchanged value with, busiest first. Failed txs are
 * skipped (nothing moved); self-transfers have no counterparty.
 */
export function summarizeCounterparties(
  txs: readonly Transaction[],
): CounterpartySummary[] {
  const map = new Map<string, CounterpartySummary>();

  for (const tx of txs) {
    if (tx.status === "failed") continue;
    const address = counterpartyOf(tx);
    if (!address) continue;

    // EVM and bech32 addresses are case-insensitive; base58 (Tron, legacy
    // Bitcoin) is not, so only the former are lowercased for grouping.
    const caseless = tx.chain === "ethereum" || address.toLowerCase().startsWith("bc1");
    const key = caseless ? address.toLowerCase() : address;
    let c = map.get(key);
    if (!c) {
      c = {
        address,
        label: getLabel(tx.chain, address),
        count: 0,
        inflow: 0,
        outflow: 0,
        net: 0,
        tokenTransfers: 0,
        firstSeen: tx.timestamp,
        lastSeen: tx.timestamp,
      };
      map.set(key, c);
    }
    c.count += 1;
    c.firstSeen = Math.min(c.firstSeen, tx.timestamp);
    c.lastSeen = Math.max(c.lastSeen, tx.timestamp);
    if (!isNative(tx)) c.tokenTransfers += 1;
    else if (tx.direction === "in") c.inflow += tx.value;
    else if (tx.direction === "out") c.outflow += tx.value;
    c.net = c.inflow - c.outflow;
  }

  return [...map.values()].sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
}

/** Transactions between the wallet and one counterparty (failed ones included). */
export function transactionsWith(
  txs: readonly Transaction[],
  counterparty: string,
): Transaction[] {
  return txs.filter((tx) => sameAddress(tx.chain, counterpartyOf(tx), counterparty));
}
