import { z } from "zod";

import { sharedCache } from "@/lib/cache";
import { CHAIN_META, nativeAsset } from "@/lib/schemas/chain";
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
/**
 * Etherscan caps page × offset at 10,000 rows per query, so a wallet's
 * newest 10k transactions are reachable with page-based cursors.
 */
const MAX_WINDOW = 10_000;
const DEFAULT_LIMIT = 500;

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

// --- Account type -----------------------------------------------------------

/**
 * Whether an address runs code. "wallet" covers both plain EOAs and EIP-7702
 * delegated EOAs: since Pectra, a wallet can carry a 23-byte delegation
 * designator (0xef0100 ‖ address) as its code while still being a person's
 * account — Vitalik's address is one. Treating "has code" as "is a contract"
 * would mislabel every such wallet.
 */
export type CodeKind = "contract" | "wallet";

const DELEGATION_PREFIX = "0xef0100";
const DELEGATION_LENGTH = 2 + 23 * 2;

export function classifyCode(code: string): CodeKind {
  const c = code.toLowerCase();
  if (c === "0x" || c === "") return "wallet";
  if (c.startsWith(DELEGATION_PREFIX) && c.length === DELEGATION_LENGTH) return "wallet";
  return "contract";
}

/** Code rarely changes; one lookup per address per day is plenty. */
const CODE_KIND_TTL_MS = 24 * 60 * 60 * 1000;
/** Free-tier Etherscan allows ~5 req/s; cap lookups per scan to stay well inside it. */
const MAX_CODE_LOOKUPS = 15;
const LOOKUP_SPACING_MS = 220;

const codeKindCache = sharedCache<CodeKind>("eth-code-kind", { maxEntries: 5000 });

const getCodeSchema = z.object({ result: z.string() });

// --- Normalization --------------------------------------------------------

/**
 * `kinds` maps lowercase addresses to their account type where known. The
 * rules, which line up with how Etherscan labels interactions:
 *
 *  - empty `to` + contractAddress           → contract-creation
 *  - outgoing with a decoded method name    → contract-call (Etherscan only
 *                                              decodes verified contracts)
 *  - outgoing with calldata                 → contract-call if `to` is a
 *                                              contract, transfer (with a memo)
 *                                              if it's a wallet, contract-call
 *                                              if unknown
 *  - incoming with calldata                 → contract-call only when the
 *                                              tracked wallet is itself a
 *                                              contract; otherwise someone sent
 *                                              ETH with a message
 *  - everything else                        → transfer
 */
export function normalizeEtherscanTx(
  tx: EtherscanTx,
  wallet: string,
  kinds: ReadonlyMap<string, CodeKind> = new Map(),
): Transaction {
  const { decimals } = CHAIN_META.ethereum;
  const isCreation = tx.contractAddress !== "" && tx.to === "";
  const to = isCreation ? tx.contractAddress : tx.to || null;
  const hasData = tx.input !== "" && tx.input !== "0x";
  const isOut = sameAddress("ethereum", tx.from, wallet);
  const isIn = sameAddress("ethereum", to, wallet);

  let category: Transaction["category"];
  if (isCreation) {
    category = "contract-creation";
  } else if (!hasData) {
    category = "transfer";
  } else if (isOut && !isIn) {
    const toKind = to ? kinds.get(to.toLowerCase()) : undefined;
    category = tx.functionName || toKind !== "wallet" ? "contract-call" : "transfer";
  } else {
    category =
      kinds.get(wallet.toLowerCase()) === "contract" ? "contract-call" : "transfer";
  }

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
    asset: nativeAsset("ethereum"),
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

/**
 * Addresses whose account type changes the classification: the wallet
 * (for incoming calldata) and undecoded outgoing call targets. Decoded
 * calls are already known to be contracts, so they're skipped.
 */
export function addressesNeedingCodeCheck(
  txs: readonly EtherscanTx[],
  wallet: string,
): string[] {
  const out = new Set<string>();
  for (const tx of txs) {
    const hasData = tx.input !== "" && tx.input !== "0x";
    if (!hasData || tx.to === "") continue;
    const isOut = sameAddress("ethereum", tx.from, wallet);
    if (isOut && !tx.functionName) out.add(tx.to.toLowerCase());
    if (!isOut) out.add(wallet.toLowerCase());
  }
  return [...out];
}

// --- Adapter --------------------------------------------------------------

/** Cursor = 1-based page number. Anything else starts from the newest page. */
function parsePageCursor(cursor: string | undefined): number {
  const n = Number(cursor);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function createEthereumAdapter(apiKey: string | undefined): ChainAdapter {
  return {
    chain: "ethereum",

    async fetchTransactions(address: string, options: FetchTransactionsOptions = {}) {
      if (!apiKey) {
        throw new UpstreamError("UPSTREAM_ERROR", "ETHERSCAN_API_KEY is not configured", {
          provider: PROVIDER,
        });
      }

      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_WINDOW);
      const page = parsePageCursor(options.cursor);
      const params = new URLSearchParams({
        chainid: String(CHAIN_ID),
        module: "account",
        action: "txlist",
        address,
        startblock: "0",
        endblock: "latest",
        page: String(page),
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
          return { transactions: [], nextCursor: null };
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

      const kinds = await resolveCodeKinds(
        addressesNeedingCodeCheck(data.result, address),
        apiKey,
      );
      const txs = data.result.map((tx) => normalizeEtherscanTx(tx, address, kinds));
      // A full page means there may be more, as long as the next page is
      // still inside Etherscan's 10k-row window.
      const more = data.result.length === limit && (page + 1) * limit <= MAX_WINDOW;
      return {
        transactions: sortNewestFirst(transactionListSchema.parse(txs)),
        nextCursor: more ? String(page + 1) : null,
      };
    },
  };
}

/**
 * Look up account types, cache-first. Best effort: lookups beyond the cap,
 * or that fail, are simply left unknown and the classifier falls back to
 * the calldata heuristic. Enrichment must never fail the scan.
 */
async function resolveCodeKinds(
  addresses: readonly string[],
  apiKey: string,
): Promise<Map<string, CodeKind>> {
  const kinds = new Map<string, CodeKind>();
  const missing: string[] = [];
  for (const a of addresses) {
    const hit = codeKindCache.get(a);
    if (hit) kinds.set(a, hit.value);
    else missing.push(a);
  }

  for (const [i, address] of missing.slice(0, MAX_CODE_LOOKUPS).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, LOOKUP_SPACING_MS));
    const params = new URLSearchParams({
      chainid: String(CHAIN_ID),
      module: "proxy",
      action: "eth_getCode",
      address,
      tag: "latest",
      apikey: apiKey,
    });
    try {
      const { result } = await fetchJson(`${BASE_URL}?${params}`, {
        provider: PROVIDER,
        schema: getCodeSchema,
        timeoutMs: 8000,
        revalidate: 0,
      });
      if (!result.startsWith("0x")) continue; // in-band error text
      const kind = classifyCode(result);
      kinds.set(address, kind);
      codeKindCache.set(address, kind, CODE_KIND_TTL_MS);
    } catch {
      // leave unknown
    }
  }
  return kinds;
}
