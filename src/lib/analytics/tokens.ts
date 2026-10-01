import { isValidAddress } from "@/lib/chains/address";
import type { TokenPriceMap } from "@/lib/prices/coingecko";
import { isNative, type Asset, type Transaction } from "@/lib/schemas/transaction";

export type TokenSummary = {
  asset: Asset & { contract: string };
  inflow: number;
  outflow: number;
  count: number;
  /** Current USD price, when CoinGecko knows the contract. */
  price: number | null;
  lastSeen: number;
};

/**
 * Per-token totals, busiest first. Tokens CoinGecko can't price are kept but
 * flagged by `price: null`: on Tron especially, unpriced tokens are very
 * often spam airdrops named like websites.
 */
export function summarizeTokens(
  txs: readonly Transaction[],
  prices: TokenPriceMap = {},
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
        price: prices[contract] ?? null,
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
 * Distinct priceable token contracts in a tx set, sorted, for a price
 * lookup. Assets without a real contract address (TRC-10 ids) are left out.
 */
export function tokenContracts(txs: readonly Transaction[]): string[] {
  const contracts = new Set<string>();
  for (const t of txs) {
    if (!isNative(t) && isValidAddress(t.chain, t.asset.contract!))
      contracts.add(t.asset.contract!);
  }
  return [...contracts].sort();
}
