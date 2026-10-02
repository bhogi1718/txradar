import type { DailyPrices, TokenPricing } from "@/lib/prices/coingecko";
import { isNative, type Transaction } from "@/lib/schemas/transaction";

const DAY_MS = 24 * 3600 * 1000;

/**
 * USD price of the day containing `ts`, from an ascending daily series.
 * Returns null for timestamps before the series starts (no guessing) or
 * that fall in a gap in the data; timestamps after the last point use the
 * latest price.
 */
export function priceAt(series: DailyPrices, ts: number): number | null {
  if (series.length === 0) return null;
  if (ts < series[0]![0]) return null;

  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid]![0] <= ts) lo = mid;
    else hi = mid - 1;
  }
  const point = series[lo]!;
  if (lo < series.length - 1 && ts - point[0] >= 2 * DAY_MS) return null;
  return point[1];
}

export type PriceBasis = "historical" | "current";

export type Valuation = { usd: number; basis: PriceBasis };

export type PricingContext = {
  /** Daily native-coin closes, for "price on the day". */
  history?: DailyPrices;
  /** Current native-coin price; the fallback when history doesn't cover a date. */
  current?: number;
  /**
   * Current token prices. Undefined while loading or after a failed lookup —
   * which is different from a token being known to have no price.
   */
  tokens?: TokenPricing;
};

/** USD value of `amount` of the tx's asset, or null when it can't be priced honestly. */
export function valueAmount(
  tx: Pick<Transaction, "asset" | "timestamp">,
  amount: number,
  ctx: PricingContext,
): Valuation | null {
  if (isNative(tx)) {
    const historical = ctx.history ? priceAt(ctx.history, tx.timestamp) : null;
    if (historical !== null) return { usd: amount * historical, basis: "historical" };
    if (ctx.current !== undefined) return { usd: amount * ctx.current, basis: "current" };
    return null;
  }
  const p = ctx.tokens?.prices[tx.asset.contract!];
  return p === undefined ? null : { usd: amount * p, basis: "current" };
}

/** USD value of what the tx moved (0 for failed). */
export function valueTx(tx: Transaction, ctx: PricingContext): Valuation | null {
  return valueAmount(tx, tx.status === "failed" ? 0 : tx.value, ctx);
}

/** USD value of the tx's fee, which is always paid in the native coin. */
export function valueFee(tx: Transaction, ctx: PricingContext): Valuation | null {
  if (tx.fee === null) return null;
  return valueAmount(
    { timestamp: tx.timestamp, asset: { ...tx.asset, contract: null } },
    tx.fee,
    ctx,
  );
}

export type UsdSummary = {
  inflow: number;
  outflow: number;
  fees: number;
  net: number;
  /** "historical" when every priced tx used its own day's price. */
  basis: PriceBasis | "mixed" | null;
  /** Native txs that moved value but couldn't be priced. */
  unpriced: number;
};

/** Native-coin flows in USD at transaction time. Tokens are valued per token. */
export function summarizeUsd(
  txs: readonly Transaction[],
  ctx: PricingContext,
): UsdSummary {
  let inflow = 0;
  let outflow = 0;
  let fees = 0;
  let unpriced = 0;
  const bases = new Set<PriceBasis>();

  for (const tx of txs) {
    const f = valueFee(tx, ctx);
    if (f) fees += f.usd;

    if (
      !isNative(tx) ||
      tx.status === "failed" ||
      tx.direction === "self" ||
      tx.value === 0
    ) {
      continue;
    }
    const v = valueTx(tx, ctx);
    if (!v) {
      unpriced += 1;
      continue;
    }
    bases.add(v.basis);
    if (tx.direction === "in") inflow += v.usd;
    else outflow += v.usd;
  }

  const basis = bases.size === 0 ? null : bases.size === 2 ? "mixed" : [...bases][0]!;
  return { inflow, outflow, fees, net: inflow - outflow - fees, basis, unpriced };
}
