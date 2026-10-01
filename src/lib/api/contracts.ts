import { z } from "zod";

import { isValidAddress, normalizeAddress } from "@/lib/chains/address";
import {
  dailyPricesSchema,
  priceMapSchema,
  tokenPriceMapSchema,
} from "@/lib/prices/coingecko";
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

// --- GET /api/price-history?chain= ----------------------------------------

export const priceHistoryQuerySchema = z.object({ chain: chainSchema });

export const priceHistoryResponseSchema = z.object({
  chain: chainSchema,
  /** [utcDayStartMs, usd], ascending, ~365 days. */
  prices: dailyPricesSchema,
  fetchedAt: z.string(),
  cached: z.boolean(),
});

export type PriceHistoryResponse = z.infer<typeof priceHistoryResponseSchema>;

// --- GET /api/token-prices?chain=&contracts=a,b ---------------------------

export const TOKEN_PRICES_MAX_CONTRACTS = 30;

export const tokenPricesQuerySchema = z
  .object({
    chain: chainSchema,
    contracts: z
      .string()
      .trim()
      .min(1, "At least one contract is required")
      .transform((s) => [
        ...new Set(
          s
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        ),
      ])
      .pipe(z.array(z.string()).min(1).max(TOKEN_PRICES_MAX_CONTRACTS)),
  })
  .superRefine((q, ctx) => {
    q.contracts.forEach((c, i) => {
      if (!isValidAddress(q.chain, c)) {
        ctx.addIssue({
          code: "custom",
          path: ["contracts", i],
          message: `Not a valid ${q.chain} contract address`,
        });
      }
    });
  })
  .transform((q) => ({
    ...q,
    contracts: q.contracts.map((c) => normalizeAddress(q.chain, c)).sort(),
  }));

export const tokenPricesResponseSchema = z.object({
  chain: chainSchema,
  prices: tokenPriceMapSchema,
  fetchedAt: z.string(),
  cached: z.boolean(),
});

export type TokenPricesResponse = z.infer<typeof tokenPricesResponseSchema>;
