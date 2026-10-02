import { isValidAddress } from "@/lib/chains/address";
import type { TokenPricing } from "@/lib/prices/coingecko";
import { isNative, type Asset, type Transaction } from "@/lib/schemas/transaction";

export type TokenSummary = {
  asset: Asset & { contract: string };
  inflow: number;
  outflow: number;
  count: number;
  /** Current USD price, when known. */
  price: number | null;
  /**
   * priced:      CoinGecko has a price
   * unpriced:    CoinGecko has no market for it — likely spam
   * unavailable: we don't know (lookup pending, failed, or skipped)
   */
  priceStatus: "priced" | "unpriced" | "unavailable";
  lastSeen: number;
};

/**
 * Per-token totals, busiest first. Tokens CoinGecko knows have no market are
 * flagged `unpriced`: on Tron especially those are very often spam airdrops
 * named like websites. A failed lookup is `unavailable`, never `unpriced`.
 */
export function summarizeTokens(
  txs: readonly Transaction[],
  pricing?: TokenPricing,
): TokenSummary[] {
  const map = new Map<string, TokenSummary>();
  for (const tx of txs) {
    if (isNative(tx) || tx.status === "failed") continue;
    const contract = tx.asset.contract!;
    let s = map.get(contract);
    if (!s) {
      s = {
        asset: { ...tx.asset, contract },
        inflow: 0,
        outflow: 0,
        count: 0,
        price: pricing?.prices[contract] ?? null,
        priceStatus:
          pricing?.prices[contract] !== undefined
            ? "priced"
            : // No real contract (TRC-10 id) means no market to price it on.
              !isValidAddress(tx.chain, contract) || pricing?.unpriced.includes(contract)
              ? "unpriced"
              : "unavailable",
        lastSeen: tx.timestamp,
      };
      map.set(contract, s);
    }
    s.count += 1;
    s.lastSeen = Math.max(s.lastSeen, tx.timestamp);
    if (tx.direction === "in") s.inflow += tx.value;
    else if (tx.direction === "out") s.outflow += tx.value;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
}

/**
 * Priceable token contracts in a tx set, most-used first, for a price
 * lookup. Assets without a real contract address (TRC-10 ids) are left out.
 */
export function tokenContracts(txs: readonly Transaction[]): string[] {
  const counts = new Map<string, number>();
  for (const t of txs) {
    if (isNative(t) || !isValidAddress(t.chain, t.asset.contract!)) continue;
    counts.set(t.asset.contract!, (counts.get(t.asset.contract!) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
}
