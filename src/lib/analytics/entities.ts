import { getLabel, type AddressLabel } from "@/lib/labels";
import { isNative, type Transaction } from "@/lib/schemas/transaction";

import { counterpartyOf } from "./summary";

export type EntitySummary = {
  label: AddressLabel;
  count: number;
  /** Native coin received from / sent to this entity. */
  inflow: number;
  outflow: number;
  /** Token transfers with this entity (amounts are per token, so only counted here). */
  tokenTransfers: number;
  lastSeen: number;
};

export type ExposureSummary = {
  entities: EntitySummary[];
  /** Share (0–1) of native volume (in + out) that involved a known exchange. */
  exchangeShare: number;
  /** Transactions with any labeled counterparty. */
  labeledCount: number;
};

/** Group transactions by labeled counterparty; unlabeled addresses are skipped. */
export function summarizeExposure(txs: readonly Transaction[]): ExposureSummary {
  const map = new Map<string, EntitySummary>();
  let volume = 0;
  let exchangeVolume = 0;
  let labeledCount = 0;

  for (const tx of txs) {
    if (tx.status === "failed") continue;
    const nativeFlow = isNative(tx) && tx.direction !== "self";
    if (nativeFlow) volume += tx.value;

    const label = getLabel(tx.chain, counterpartyOf(tx));
    if (!label) continue;
    labeledCount += 1;

    const key = `${label.chain}:${label.address}`;
    let e = map.get(key);
    if (!e) {
      e = {
        label,
        count: 0,
        inflow: 0,
        outflow: 0,
        tokenTransfers: 0,
        lastSeen: tx.timestamp,
      };
      map.set(key, e);
    }
    e.count += 1;
    e.lastSeen = Math.max(e.lastSeen, tx.timestamp);
    if (!isNative(tx)) e.tokenTransfers += 1;
    else if (tx.direction === "in") e.inflow += tx.value;
    else if (tx.direction === "out") e.outflow += tx.value;

    if (nativeFlow && label.kind === "exchange") exchangeVolume += tx.value;
  }

  return {
    entities: [...map.values()].sort(
      (a, b) => b.count - a.count || b.lastSeen - a.lastSeen,
    ),
    exchangeShare: volume > 0 ? exchangeVolume / volume : 0,
    labeledCount,
  };
}
