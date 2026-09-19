import { z } from "zod";

import { chainSchema } from "./chain";

/**
 * Direction relative to the tracked wallet.
 *  - in:   net value flowed into the wallet
 *  - out:  net value flowed out of the wallet
 *  - self: wallet moved funds to itself (UTXO consolidation, change-only)
 */
export const directionSchema = z.enum(["in", "out", "self"]);
export type Direction = z.infer<typeof directionSchema>;

export const txStatusSchema = z.enum(["success", "failed", "pending"]);
export type TxStatus = z.infer<typeof txStatusSchema>;

/**
 * What kind of on-chain action this was.
 *  - transfer:          native coin moved between accounts
 *  - contract-call:     interaction with a smart contract (may carry value)
 *  - contract-creation: deployed a contract
 *  - token-transfer:    non-native asset moved (TRC-10, ERC-20 etc.)
 */
export const txCategorySchema = z.enum([
  "transfer",
  "contract-call",
  "contract-creation",
  "token-transfer",
]);
export type TxCategory = z.infer<typeof txCategorySchema>;

/**
 * One normalized transaction. Every chain adapter produces exactly this
 * shape so the UI never has to know which explorer the data came from.
 */
export const transactionSchema = z.object({
  chain: chainSchema,
  hash: z.string().min(1),
  /** Unix epoch in milliseconds. */
  timestamp: z.number().int().nonnegative(),
  blockHeight: z.number().int().nonnegative().nullable(),
  /** Normalized (chain-canonical casing) address, or null when unknown. */
  from: z.string().min(1).nullable(),
  to: z.string().min(1).nullable(),
  /**
   * Amount in native units (BTC / ETH / TRX) as seen from the wallet:
   * what entered on `in`, what reached others on `out`, what was moved on `self`.
   */
  value: z.number().nonnegative(),
  /** Network fee in native units. Null when not attributable to the wallet. */
  fee: z.number().nonnegative().nullable(),
  direction: directionSchema,
  status: txStatusSchema,
  category: txCategorySchema,
  /** Kept for the table's "Contract" column; derived from `category`. */
  isContract: z.boolean(),
  /** Human-readable method for contract calls, when the explorer provides it. */
  method: z.string().nullable(),
});

export type Transaction = z.infer<typeof transactionSchema>;

export const transactionListSchema = z.array(transactionSchema);
