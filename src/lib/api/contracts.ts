import { z } from "zod";

import { isValidAddress, normalizeAddress } from "@/lib/chains/address";
import { priceMapSchema } from "@/lib/prices/coingecko";
import { chainSchema } from "@/lib/schemas/chain";
import { transactionListSchema } from "@/lib/schemas/transaction";

/**
 * Shared request/response contracts for /api/*. Both the route handlers and
 * the client hooks import from here, so they can never drift apart.
 */

// --- GET /api/transactions -------------------------------------------------

export const TRANSACTIONS_MAX_LIMIT = 1000;
export const TRANSACTIONS_DEFAULT_LIMIT = 500;

export const transactionsQuerySchema = z
  .object({
    chain: chainSchema,
    address: z.string().trim().min(1, "Address is required"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(TRANSACTIONS_MAX_LIMIT)
      .default(TRANSACTIONS_DEFAULT_LIMIT),
  })
  .superRefine((q, ctx) => {
    if (!isValidAddress(q.chain, q.address)) {
      ctx.addIssue({
        code: "custom",
        path: ["address"],
        message: `Not a valid ${q.chain} address`,
      });
    }
  })
  .transform((q) => ({ ...q, address: normalizeAddress(q.chain, q.address) }));

export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;

export const transactionsResponseSchema = z.object({
  chain: chainSchema,
  address: z.string(),
  transactions: transactionListSchema,
  /** ISO timestamp of when the upstream was actually queried. */
  fetchedAt: z.string(),
  /** True when served from the server-side cache. */
  cached: z.boolean(),
});

export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>;

// --- GET /api/prices -------------------------------------------------------

export const pricesResponseSchema = z.object({
  prices: priceMapSchema,
  fetchedAt: z.string(),
  cached: z.boolean(),
});

export type PricesResponse = z.infer<typeof pricesResponseSchema>;
