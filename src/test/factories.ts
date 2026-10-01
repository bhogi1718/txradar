import type { Transaction } from "@/lib/schemas/transaction";

let seq = 0;

/** Build a valid Transaction with sensible defaults; override what the test cares about. */
export function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    chain: "ethereum",
    hash: `0x${seq.toString(16).padStart(64, "0")}`,
    timestamp: Date.UTC(2026, 8, 1, 12),
    blockHeight: 1000 + seq,
    from: "0xsender",
    to: "0xwallet",
    asset: { symbol: "ETH", contract: null, decimals: 18 },
    value: 1,
    fee: null,
    direction: "in",
    status: "success",
    category: "transfer",
    isContract: false,
    method: null,
    ...overrides,
  };
}
