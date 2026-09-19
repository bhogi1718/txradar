import { z } from "zod";

import { CHAIN_META } from "@/lib/schemas/chain";
import { transactionListSchema, type Transaction } from "@/lib/schemas/transaction";

import {
  sortNewestFirst,
  type ChainAdapter,
  type FetchTransactionsOptions,
} from "./adapter";
import { sameAddress } from "./address";
import { UpstreamError } from "./errors";
import { fetchJson } from "./http";
import { fromBaseUnits } from "./units";

const PROVIDER = "etherscan";
const BASE_URL = "https://api.etherscan.io/v2/api";
const CHAIN_ID = 1;
/** Etherscan's hard cap per page on the free tier. */
const MAX_OFFSET = 10_000;
const DEFAULT_LIMIT = 1_000;

// --- Upstream shape -------------------------------------------------------

const etherscanTxSchema = z.object({
  blockNumber: z.string(),
  timeStamp: z.string(),
  hash: z.string(),
  from: z.string(),
  to: z.string(),
  value: z.string(),
  gasPrice: z.string(),
  gasUsed: z.string(),
  isError: z.string(),
  txreceipt_status: z.string(),
  input: z.string(),
  contractAddress: z.string(),
  functionName: z.string(),
  methodId: z.string(),
});

/**
 * Etherscan overloads `result`: an array on success, a string message on
 * "no transactions" or on errors (rate limit, bad key). Model both.
 */
const etherscanResponseSchema = z.object({
  status: z.enum(["0", "1"]),
  message: z.string(),
  result: z.union([z.array(etherscanTxSchema), z.string()]),
});

type EtherscanTx = z.infer<typeof etherscanTxSchema>;

// --- Normalization --------------------------------------------------------

export function normalizeEtherscanTx(tx: EtherscanTx, wallet: string): Transaction {
  const { decimals } = CHAIN_META.ethereum;
  const isCreation = tx.contractAddress !== "" && tx.to === "";
  const to = isCreation ? tx.contractAddress : tx.to || null;
  const hasData = tx.input !== "" && tx.input !== "0x";
  const isOut = sameAddress("ethereum", tx.from, wallet);
  const isIn = sameAddress("ethereum", to, wallet);

  const category = isCreation
    ? "contract-creation"
    : hasData
      ? "contract-call"
      : "transfer";
  const failed = tx.isError === "1" || tx.txreceipt_status === "0";

  // gasUsed * gasPrice, both wei-denominated integers.
  const feeWei = BigInt(tx.gasUsed) * BigInt(tx.gasPrice);

  return {
    chain: "ethereum",
    hash: tx.hash,
    timestamp: Number(tx.timeStamp) * 1000,
    blockHeight: Number(tx.blockNumber),
    from: tx.from.toLowerCase(),
    to: to ? to.toLowerCase() : null,
    // A failed tx moves no value, but the fee is still burned.
    value: failed ? 0 : fromBaseUnits(tx.value, decimals),
    // Only the sender pays gas.
    fee: isOut ? fromBaseUnits(feeWei, decimals) : null,
    direction: isOut && isIn ? "self" : isOut ? "out" : "in",
    status: failed ? "failed" : "success",
    category,
    isContract: category !== "transfer",
    method: tx.functionName ? tx.functionName.split("(")[0] || null : null,
  };
}

// --- Adapter --------------------------------------------------------------

export function createEthereumAdapter(apiKey: string | undefined): ChainAdapter {
  return {
    chain: "ethereum",

    async fetchTransactions(address: string, options: FetchTransactionsOptions = {}) {
      if (!apiKey) {
        throw new UpstreamError("UPSTREAM_ERROR", "ETHERSCAN_API_KEY is not configured", {
          provider: PROVIDER,
        });
      }

      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_OFFSET);
      const params = new URLSearchParams({
        chainid: String(CHAIN_ID),
        module: "account",
        action: "txlist",
        address,
        startblock: "0",
        endblock: "latest",
        page: "1",
        offset: String(limit),
        sort: "desc",
        apikey: apiKey,
      });

      const data = await fetchJson(`${BASE_URL}?${params}`, {
        provider: PROVIDER,
        schema: etherscanResponseSchema,
        revalidate: options.revalidate,
      });

      if (typeof data.result === "string") {
        // status "0" + "No transactions found" is a legitimate empty result.
        if (
          /no transactions found/i.test(data.message) ||
          /no transactions found/i.test(data.result)
        ) {
          return [];
        }
        if (/rate limit/i.test(data.result)) {
          throw new UpstreamError("RATE_LIMITED", data.result, {
            provider: PROVIDER,
            retryAfter: 5,
          });
        }
        throw new UpstreamError("UPSTREAM_ERROR", `${data.message}: ${data.result}`, {
          provider: PROVIDER,
        });
      }

      const txs = data.result.map((tx) => normalizeEtherscanTx(tx, address));
      return sortNewestFirst(transactionListSchema.parse(txs));
    },
  };
}
