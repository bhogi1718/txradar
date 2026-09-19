import { z } from "zod";

import { CHAIN_META } from "@/lib/schemas/chain";
import { transactionListSchema, type Transaction } from "@/lib/schemas/transaction";

import {
  sortNewestFirst,
  type ChainAdapter,
  type FetchTransactionsOptions,
} from "./adapter";
import { sameAddress } from "./address";
import { fetchJson } from "./http";
import { fromBaseUnits } from "./units";

const PROVIDER = "esplora";
/**
 * Esplora is the API served by both mempool.space and blockstream.info with
 * an identical shape. Blockstream is the default because mempool.space is
 * unreachable on some networks; override via ESPLORA_BASE_URL.
 */
export const DEFAULT_ESPLORA_BASE_URL = "https://blockstream.info/api";
/** Esplora returns up to 25 confirmed txs per page plus any in the mempool. */
const PAGE_SIZE = 25;

// --- Upstream shape -------------------------------------------------------

const prevoutSchema = z.object({
  scriptpubkey_address: z.string().optional(),
  value: z.number().int().nonnegative(),
});

const vinSchema = z.object({
  txid: z.string().optional(),
  is_coinbase: z.boolean(),
  prevout: prevoutSchema.nullable().optional(),
});

const voutSchema = z.object({
  scriptpubkey_address: z.string().optional(),
  value: z.number().int().nonnegative(),
});

const esploraTxSchema = z.object({
  txid: z.string(),
  vin: z.array(vinSchema),
  vout: z.array(voutSchema),
  fee: z.number().int().nonnegative(),
  status: z.object({
    confirmed: z.boolean(),
    block_height: z.number().int().nonnegative().optional(),
    block_time: z.number().int().nonnegative().optional(),
  }),
});

const esploraTxListSchema = z.array(esploraTxSchema);

type EsploraTx = z.infer<typeof esploraTxSchema>;

// --- Normalization --------------------------------------------------------

/**
 * UTXO transactions have no single sender/receiver, so direction is derived
 * from the wallet's *net* position:
 *
 *   sent      = Σ inputs the wallet spent
 *   received  = Σ outputs paid back to the wallet (incl. change)
 *   toOthers  = Σ outputs paid to anyone else
 *
 *   self : wallet spent and nothing left the wallet (consolidation / change-only)
 *   in   : net ≥ 0 — the wallet ended up richer, even if it contributed inputs
 *          (multi-party transactions such as coinjoins or batched deposits)
 *   out  : net < 0 — value reached other parties; reported net of fee
 *
 * Fees are attributed only when every input belongs to the wallet; with
 * mixed inputs there is no honest way to say who paid.
 */
export function normalizeEsploraTx(
  tx: EsploraTx,
  wallet: string,
  now = Date.now(),
): Transaction {
  const { decimals } = CHAIN_META.bitcoin;
  const isWallet = (addr: string | undefined) =>
    sameAddress("bitcoin", addr ?? null, wallet);

  let sent = 0;
  let walletInputs = 0;
  let firstInputAddress: string | null = null;
  for (const vin of tx.vin) {
    if (vin.is_coinbase) {
      firstInputAddress ??= "coinbase";
      continue;
    }
    const prev = vin.prevout;
    if (!prev) continue;
    firstInputAddress ??= prev.scriptpubkey_address ?? null;
    if (isWallet(prev.scriptpubkey_address)) {
      sent += prev.value;
      walletInputs += 1;
    }
  }

  let received = 0;
  let toOthers = 0;
  let firstOtherOutput: string | null = null;
  for (const vout of tx.vout) {
    if (isWallet(vout.scriptpubkey_address)) {
      received += vout.value;
    } else {
      toOthers += vout.value;
      firstOtherOutput ??= vout.scriptpubkey_address ?? null;
    }
  }

  const net = received - sent;
  const walletPaidFee =
    walletInputs > 0 && walletInputs === tx.vin.filter((v) => !v.is_coinbase).length;

  let direction: Transaction["direction"];
  let value: number;
  if (sent > 0 && toOthers === 0) {
    direction = "self";
    value = received;
  } else if (net >= 0) {
    direction = "in";
    value = net;
  } else {
    direction = "out";
    // Amount that reached others out of the wallet's own funds.
    value = Math.max(0, -net - (walletPaidFee ? tx.fee : 0));
  }

  const confirmed = tx.status.confirmed && tx.status.block_time !== undefined;

  return {
    chain: "bitcoin",
    hash: tx.txid,
    timestamp: confirmed ? tx.status.block_time! * 1000 : now,
    blockHeight: confirmed ? (tx.status.block_height ?? null) : null,
    from: direction === "in" ? firstInputAddress : wallet,
    to: direction === "out" ? firstOtherOutput : wallet,
    value: fromBaseUnits(value, decimals),
    fee: walletPaidFee ? fromBaseUnits(tx.fee, decimals) : null,
    direction,
    status: confirmed ? "success" : "pending",
    category: "transfer",
    isContract: false,
    method: null,
  };
}

// --- Adapter --------------------------------------------------------------

export function createBitcoinAdapter(
  baseUrl: string = DEFAULT_ESPLORA_BASE_URL,
): ChainAdapter {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    chain: "bitcoin",

    async fetchTransactions(address: string, options: FetchTransactionsOptions = {}) {
      const data = await fetchJson(`${root}/address/${encodeURIComponent(address)}/txs`, {
        provider: PROVIDER,
        schema: esploraTxListSchema,
        revalidate: options.revalidate,
      });

      const limit = options.limit ?? PAGE_SIZE;
      const txs = data
        .slice(0, Math.max(limit, PAGE_SIZE))
        .map((tx) => normalizeEsploraTx(tx, address));
      return sortNewestFirst(transactionListSchema.parse(txs));
    },
  };
}
