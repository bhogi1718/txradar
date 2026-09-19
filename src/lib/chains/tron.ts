import { z } from "zod";

import { CHAIN_META } from "@/lib/schemas/chain";
import { transactionListSchema, type Transaction } from "@/lib/schemas/transaction";

import {
  sortNewestFirst,
  type ChainAdapter,
  type FetchTransactionsOptions,
} from "./adapter";
import { fetchJson } from "./http";
import { tronHexToBase58 } from "./tron-address";
import { fromBaseUnits } from "./units";

const PROVIDER = "trongrid";
const BASE_URL = "https://api.trongrid.io/v1";
/** TronGrid's per-request ceiling. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 200;

// --- Upstream shape -------------------------------------------------------

/**
 * Only the contract types we interpret are modelled; anything else passes
 * through as an unknown string so a new type never breaks parsing.
 */
const contractValueSchema = z.object({
  owner_address: z.string(),
  to_address: z.string().optional(),
  contract_address: z.string().optional(),
  /** TransferContract / TransferAssetContract amount (sun or token units). */
  amount: z.number().int().nonnegative().optional(),
  /** TRX attached to a smart-contract call, in sun. */
  call_value: z.number().int().nonnegative().optional(),
  /** TRC-10 asset id (TransferAssetContract). */
  asset_name: z.string().optional(),
  data: z.string().optional(),
});

const contractSchema = z.object({
  type: z.string(),
  parameter: z.object({ value: contractValueSchema }),
});

const tronGridTxSchema = z.object({
  txID: z.string(),
  block_timestamp: z.number().int().nonnegative(),
  blockNumber: z.number().int().nonnegative().optional(),
  ret: z
    .array(
      z.object({
        contractRet: z.string().optional(),
        fee: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
  raw_data: z.object({ contract: z.array(contractSchema).min(1) }),
});

const tronGridResponseSchema = z.object({
  data: z.array(tronGridTxSchema),
  success: z.boolean(),
  meta: z.object({ fingerprint: z.string().optional() }).passthrough(),
});

type TronGridTx = z.infer<typeof tronGridTxSchema>;

// --- Normalization --------------------------------------------------------

function toBase58(hex: string | undefined): string | null {
  if (!hex) return null;
  try {
    return tronHexToBase58(hex);
  } catch {
    return null;
  }
}

export function normalizeTronGridTx(tx: TronGridTx, wallet: string): Transaction {
  const { decimals } = CHAIN_META.tron;
  // A Tron tx can technically carry several contracts; in practice it is one.
  const contract = tx.raw_data.contract[0]!;
  const v = contract.parameter.value;

  const from = toBase58(v.owner_address);
  const isOut = from === wallet;

  let to: string | null;
  let category: Transaction["category"];
  let valueSun: number;

  switch (contract.type) {
    case "TransferContract":
      to = toBase58(v.to_address);
      category = "transfer";
      valueSun = v.amount ?? 0;
      break;
    case "TriggerSmartContract":
      to = toBase58(v.contract_address);
      category = "contract-call";
      valueSun = v.call_value ?? 0;
      break;
    case "CreateSmartContract":
      to = toBase58(v.contract_address);
      category = "contract-creation";
      valueSun = v.call_value ?? 0;
      break;
    case "TransferAssetContract":
      // TRC-10 token: `amount` is in token units, not TRX. Native value is 0.
      to = toBase58(v.to_address);
      category = "token-transfer";
      valueSun = 0;
      break;
    default:
      // Staking, votes, resource delegation, etc. Surface it, value 0.
      to = toBase58(v.to_address ?? v.contract_address);
      category = "contract-call";
      valueSun = 0;
  }

  const isIn = to === wallet;
  const ret = tx.ret?.[0];
  const failed = ret?.contractRet !== undefined && ret.contractRet !== "SUCCESS";

  return {
    chain: "tron",
    hash: tx.txID,
    timestamp: tx.block_timestamp,
    blockHeight: tx.blockNumber ?? null,
    from,
    to,
    value: failed ? 0 : fromBaseUnits(valueSun, decimals),
    fee: isOut && ret?.fee !== undefined ? fromBaseUnits(ret.fee, decimals) : null,
    direction: isOut && isIn ? "self" : isOut ? "out" : "in",
    status: failed ? "failed" : "success",
    category,
    isContract: category === "contract-call" || category === "contract-creation",
    method: contract.type === "TriggerSmartContract" ? "TriggerSmartContract" : null,
  };
}

// --- Adapter --------------------------------------------------------------

export function createTronAdapter(apiKey: string | undefined): ChainAdapter {
  return {
    chain: "tron",

    async fetchTransactions(address: string, options: FetchTransactionsOptions = {}) {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const params = new URLSearchParams({
        limit: String(limit),
        order_by: "block_timestamp,desc",
        only_confirmed: "true",
      });

      const data = await fetchJson(
        `${BASE_URL}/accounts/${encodeURIComponent(address)}/transactions?${params}`,
        {
          provider: PROVIDER,
          schema: tronGridResponseSchema,
          headers: apiKey ? { "TRON-PRO-API-KEY": apiKey } : undefined,
          revalidate: options.revalidate,
        },
      );

      const txs = data.data.map((tx) => normalizeTronGridTx(tx, address));
      return sortNewestFirst(transactionListSchema.parse(txs));
    },
  };
}
