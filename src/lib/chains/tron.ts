import { z } from "zod";

import { CHAIN_META, nativeAsset } from "@/lib/schemas/chain";
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

/** /v1/accounts/{addr}/transactions/trc20 — one row per token Transfer event. */
const trc20TransferSchema = z.object({
  transaction_id: z.string(),
  token_info: z.object({
    symbol: z.string(),
    address: z.string(),
    decimals: z.number().int().nonnegative(),
    name: z.string().optional(),
  }),
  block_timestamp: z.number().int().nonnegative(),
  from: z.string(),
  to: z.string(),
  type: z.string(),
  /** Base-unit integer as a string. */
  value: z.string().regex(/^\d+$/),
});

const trc20ResponseSchema = z.object({
  data: z.array(trc20TransferSchema),
  success: z.boolean(),
  meta: z.object({ fingerprint: z.string().optional() }).passthrough().optional(),
});

/**
 * TronGrid pages each list with its own `fingerprint`. The cursor carries
 * both; a list whose fingerprint is null is exhausted and isn't re-fetched.
 */
type TronCursor = { native: string | null; trc20: string | null };

const tronCursorSchema = z.object({
  native: z.string().nullable(),
  trc20: z.string().nullable(),
});

export function encodeTronCursor(c: TronCursor): string | null {
  return c.native || c.trc20 ? JSON.stringify(c) : null;
}

export function decodeTronCursor(cursor: string | undefined): TronCursor | null {
  if (!cursor) return null;
  try {
    const parsed = tronCursorSchema.safeParse(JSON.parse(cursor));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type Trc20Transfer = z.infer<typeof trc20TransferSchema>;

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
  let asset: Transaction["asset"] = nativeAsset("tron");
  let assetDecimals = decimals;

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
      // TRC-10 token, identified by a numeric id. TronGrid doesn't return its
      // precision, so the amount stays in raw units (decimals 0) and the
      // asset is never priced — the UI marks it unverified.
      to = toBase58(v.to_address);
      category = "token-transfer";
      valueSun = v.amount ?? 0;
      asset = {
        symbol: `TRC-10 #${v.asset_name ?? "?"}`,
        contract: `trc10:${v.asset_name ?? "unknown"}`,
        decimals: 0,
      };
      assetDecimals = 0;
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
    asset,
    value: failed ? 0 : fromBaseUnits(valueSun, assetDecimals),
    fee: isOut && ret?.fee !== undefined ? fromBaseUnits(ret.fee, decimals) : null,
    direction: isOut && isIn ? "self" : isOut ? "out" : "in",
    status: failed ? "failed" : "success",
    category,
    isContract: category === "contract-call" || category === "contract-creation",
    method: contract.type === "TriggerSmartContract" ? "TriggerSmartContract" : null,
  };
}

/**
 * A TRC-20 Transfer as a token transaction. Fee and block are unknown here;
 * `mergeTokenTransfers` fills them in from the matching native row when the
 * wallet itself sent it (the only case where the wallet paid the fee).
 */
export function normalizeTrc20Transfer(t: Trc20Transfer, wallet: string): Transaction {
  const isOut = t.from === wallet;
  const isIn = t.to === wallet;
  const symbol = t.token_info.symbol.trim() || t.token_info.name?.trim() || "TOKEN";
  return {
    chain: "tron",
    hash: t.transaction_id,
    timestamp: t.block_timestamp,
    blockHeight: null,
    from: t.from,
    to: t.to,
    asset: { symbol, contract: t.token_info.address, decimals: t.token_info.decimals },
    value: fromBaseUnits(t.value, t.token_info.decimals),
    fee: null,
    direction: isOut && isIn ? "self" : isOut ? "out" : "in",
    status: "success", // TronGrid only emits Transfer events for successful calls
    category: "token-transfer",
    isContract: false,
    method: "transfer",
  };
}

/**
 * Sending a token is a TriggerSmartContract call to the token contract: the
 * native list shows it as a value-0 contract call, the TRC-20 list shows the
 * real amount. Collapse each pair into one token row that keeps the native
 * row's fee and block height, so the table shows the transfer once.
 */
export function mergeTokenTransfers(
  native: readonly Transaction[],
  tokens: readonly Transaction[],
): Transaction[] {
  const byHash = new Map(native.map((tx) => [tx.hash, tx]));
  const absorbed = new Set<string>();

  const enriched = tokens.map((token) => {
    const call = byHash.get(token.hash);
    if (!call || call.category !== "contract-call" || call.value !== 0) return token;
    absorbed.add(call.hash);
    return {
      ...token,
      fee: call.fee,
      blockHeight: call.blockHeight,
      status: call.status,
    };
  });

  return [...native.filter((tx) => !absorbed.has(tx.hash)), ...enriched];
}

// --- Adapter --------------------------------------------------------------

export function createTronAdapter(apiKey: string | undefined): ChainAdapter {
  return {
    chain: "tron",

    async fetchTransactions(address: string, options: FetchTransactionsOptions = {}) {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const cursor = decodeTronCursor(options.cursor);
      const base = `${BASE_URL}/accounts/${encodeURIComponent(address)}`;
      const common = {
        provider: PROVIDER,
        headers: apiKey ? { "TRON-PRO-API-KEY": apiKey } : undefined,
        revalidate: options.revalidate,
      };
      const params = (fingerprint: string | null) => {
        const p = new URLSearchParams({
          limit: String(limit),
          order_by: "block_timestamp,desc",
          only_confirmed: "true",
        });
        if (fingerprint) p.set("fingerprint", fingerprint);
        return p;
      };

      // First page: fetch both lists. Later pages: only lists with more to give.
      const wantNative = !cursor || cursor.native !== null;
      const wantTrc20 = !cursor || cursor.trc20 !== null;

      const [data, trc20] = await Promise.all([
        wantNative
          ? fetchJson(`${base}/transactions?${params(cursor?.native ?? null)}`, {
              ...common,
              schema: tronGridResponseSchema,
            })
          : null,
        // Token history is enrichment: if it fails, still show native history.
        wantTrc20
          ? fetchJson(`${base}/transactions/trc20?${params(cursor?.trc20 ?? null)}`, {
              ...common,
              schema: trc20ResponseSchema,
            }).catch(() => null)
          : null,
      ]);

      const native = data?.data.map((tx) => normalizeTronGridTx(tx, address)) ?? [];
      const tokens = trc20?.data.map((t) => normalizeTrc20Transfer(t, address)) ?? [];

      return {
        transactions: sortNewestFirst(
          transactionListSchema.parse(mergeTokenTransfers(native, tokens)),
        ),
        nextCursor: encodeTronCursor({
          native: data?.meta.fingerprint ?? null,
          // A failed token request ends token paging rather than retrying forever.
          trc20: trc20?.meta?.fingerprint ?? null,
        }),
      };
    },
  };
}
