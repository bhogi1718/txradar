import { counterpartyOf } from "@/lib/analytics/summary";
import { valueFee, valueTx, type PricingContext } from "@/lib/analytics/valuation";
import { getLabel } from "@/lib/labels";
import { CHAIN_META, type Chain } from "@/lib/schemas/chain";
import type { Transaction } from "@/lib/schemas/transaction";

const HEADERS = [
  "timestamp_utc",
  "chain",
  "hash",
  "direction",
  "status",
  "category",
  "method",
  "from",
  "to",
  "counterparty",
  "counterparty_label",
  "asset",
  "asset_contract",
  "amount",
  "fee",
  "fee_asset",
  "value_usd",
  "value_usd_basis",
  "fee_usd",
  "explorer_url",
] as const;

/**
 * Quote a text cell per RFC 4180 and defuse spreadsheet formula injection:
 * a cell starting with = + - @ (or a tab/CR) is executed as a formula by
 * Excel/Sheets, so it gets a leading apostrophe. Counterparty labels and
 * token symbols come from third parties, so this matters.
 */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * Numbers are written plainly — no grouping, no exponent — so spreadsheets
 * parse them. JS prints tiny values as "1e-9", which Excel reads as text.
 */
export function csvNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const s = String(value);
  if (!/e/i.test(s)) return s;
  return value.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}

function signedAmount(tx: Transaction): number {
  if (tx.direction === "out") return -tx.value;
  return tx.value;
}

/** Serialize transactions to CSV, one row per transaction, in the given order. */
export function transactionsToCsv(
  txs: readonly Transaction[],
  options: { pricing?: PricingContext } = {},
): string {
  const pricing = options.pricing ?? {};
  const lines = [HEADERS.join(",")];

  for (const tx of txs) {
    const meta = CHAIN_META[tx.chain];
    const cp = counterpartyOf(tx);
    const value = valueTx(tx, pricing);
    const fee = valueFee(tx, pricing);
    const row = [
      csvText(new Date(tx.timestamp).toISOString()),
      csvText(tx.chain),
      csvText(tx.hash),
      csvText(tx.direction),
      csvText(tx.status),
      csvText(tx.category),
      csvText(tx.method),
      csvText(tx.from),
      csvText(tx.to),
      csvText(cp),
      csvText(getLabel(tx.chain, cp)?.name),
      csvText(tx.asset.symbol),
      csvText(tx.asset.contract),
      csvNumber(tx.status === "failed" ? 0 : signedAmount(tx)),
      csvNumber(tx.fee),
      csvText(tx.fee === null ? null : meta.symbol),
      csvNumber(value?.usd ?? null),
      csvText(value?.basis ?? null),
      csvNumber(fee?.usd ?? null),
      csvText(meta.explorer.tx(tx.hash)),
    ];
    lines.push(row.join(","));
  }
  // CRLF line endings are what RFC 4180 and Excel expect.
  return lines.join("\r\n") + "\r\n";
}

/** e.g. txradar-ethereum-0xd8da6bf2-30d-2026-10-02.csv */
export function csvFileName(
  chain: Chain,
  address: string,
  range: string,
  now: Date = new Date(),
): string {
  const day = now.toISOString().slice(0, 10);
  const short = address.slice(0, 10).replace(/[^a-zA-Z0-9]/g, "");
  return `txradar-${chain}-${short}-${range}-${day}.csv`;
}

/**
 * Trigger a browser download. A UTF-8 BOM makes Excel read non-ASCII token
 * names correctly instead of guessing a legacy code page.
 */
export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
