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
import { mergeTokenTransfers } from "./merge";
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

type EtherscanTx = z.infer<typeof etherscanTxSchema>;

/** action=tokentx — one row per ERC-20 Transfer event involving the wallet. */
const tokenTxSchema = z.object({
  blockNumber: z.string(),
  timeStamp: z.string(),
  hash: z.string(),
  from: z.string(),
  to: z.string(),
  value: z.string().regex(/^\d+$/),
  contractAddress: z.string(),
  tokenName: z.string(),
  tokenSymbol: z.string(),
  tokenDecimal: z.string(),
});
type EtherscanTokenTx = z.infer<typeof tokenTxSchema>;

/** action=txlistinternal — native ETH moved by contracts inside a transaction. */
const internalTxSchema = z.object({
  blockNumber: z.string(),
  timeStamp: z.string(),
  hash: z.string(),
  from: z.string(),
  to: z.string(),
  value: z.string().regex(/^\d+$/),
  contractAddress: z.string(),
  type: z.string(),
  isError: z.string(),
});
type EtherscanInternalTx = z.infer<typeof internalTxSchema>;

/**
 * Etherscan overloads `result`: an array on success, a string message on
 * "no transactions" or on errors (rate limit, bad key). Model both.
 */
function listResponse<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    status: z.enum(["0", "1"]),
    message: z.string(),
    result: z.union([z.array(row), z.string()]),
  });
}

// --- Token & internal transfers -------------------------------------------

const MAX_SYMBOL_LENGTH = 32;

const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
};

/** Etherscan returns token names HTML-escaped ("&lt;3"); show the real text. */
export function decodeEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|#39);/g, (m) => HTML_ENTITIES[m] ?? m);
}

/** Spam tokens use long, emoji-laden names; keep symbols readable. */
function tokenSymbol(t: EtherscanTokenTx): string {
  const raw = decodeEntities(
    t.tokenSymbol.trim() || t.tokenName.trim() || "TOKEN",
  ).replace(/\s+/g, " ");
  return raw.length > MAX_SYMBOL_LENGTH ? `${raw.slice(0, MAX_SYMBOL_LENGTH - 1)}…` : raw;
}

/**
 * An ERC-20 transfer as a token transaction. Its fee is unknown here: when
 * the wallet sent it, `mergeTokenTransfers` takes the fee from the matching
 * value-0 contract call in the normal list.
 */
export function normalizeTokenTx(t: EtherscanTokenTx, wallet: string): Transaction {
  const parsed = Number(t.tokenDecimal);
  const decimals = Number.isInteger(parsed) && parsed >= 0 && parsed <= 77 ? parsed : 0;
  const isOut = sameAddress("ethereum", t.from, wallet);
  const isIn = sameAddress("ethereum", t.to, wallet);
  return {
    chain: "ethereum",
    hash: t.hash,
    timestamp: Number(t.timeStamp) * 1000,
    blockHeight: Number(t.blockNumber),
    from: t.from.toLowerCase(),
    to: t.to.toLowerCase() || null,
    asset: {
      symbol: tokenSymbol(t),
      contract: t.contractAddress.toLowerCase(),
      decimals,
    },
    value: fromBaseUnits(t.value, decimals),
    fee: null,
    direction: isOut && isIn ? "self" : isOut ? "out" : "in",
    status: "success", // Transfer events are only emitted by successful calls
    category: "token-transfer",
    isContract: false,
    method: "transfer",
  };
}

/**
 * ETH moved by a contract inside a transaction — an exchange's withdrawal
 * contract paying out, a DEX returning ETH, a refund. Without these, ETH
 * the wallet received from contracts is missing from its history. The fee
 * belongs to whoever sent the outer transaction, so it's never attributed
 * here.
 */
export function normalizeInternalTx(t: EtherscanInternalTx, wallet: string): Transaction {
  const to = t.to || t.contractAddress || null;
  const isOut = sameAddress("ethereum", t.from, wallet);
  const isIn = sameAddress("ethereum", to, wallet);
  const failed = t.isError === "1";
  return {
    chain: "ethereum",
    hash: t.hash,
    timestamp: Number(t.timeStamp) * 1000,
    blockHeight: Number(t.blockNumber),
    from: t.from.toLowerCase(),
    to: to ? to.toLowerCase() : null,
    asset: nativeAsset("ethereum"),
    value: failed ? 0 : fromBaseUnits(t.value, CHAIN_META.ethereum.decimals),
    fee: null,
    direction: isOut && isIn ? "self" : isOut ? "out" : "in",
    status: failed ? "failed" : "success",
    category: "internal-transfer",
    isContract: true,
    method: null,
  };
}

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

/**
 * Each of the three lists pages independently (1-based page numbers);
 * null means that list is exhausted. Unknown or malformed cursors start
 * over from the newest page.
 */
type EthCursor = {
  normal: number | null;
  tokens: number | null;
  internal: number | null;
};

const pageSchema = z.number().int().min(1).nullable();
const ethCursorSchema = z.object({
  normal: pageSchema,
  tokens: pageSchema,
  internal: pageSchema,
});
const FIRST_PAGE: EthCursor = { normal: 1, tokens: 1, internal: 1 };

export function decodeEthCursor(cursor: string | undefined): EthCursor {
  if (!cursor) return FIRST_PAGE;
  try {
    const parsed = ethCursorSchema.safeParse(JSON.parse(cursor));
    return parsed.success ? parsed.data : FIRST_PAGE;
  } catch {
    return FIRST_PAGE;
  }
}

export function encodeEthCursor(c: EthCursor): string | null {
  return c.normal || c.tokens || c.internal ? JSON.stringify(c) : null;
}

export function createEthereumAdapter(apiKey: string | undefined): ChainAdapter {
  /** Fetch one page of one Etherscan account list. "No transactions" → []. */
  async function fetchList<T extends z.ZodTypeAny>(
    action: "txlist" | "tokentx" | "txlistinternal",
    row: T,
    address: string,
    page: number,
    limit: number,
    revalidate: number | false | undefined,
  ): Promise<z.infer<T>[]> {
    const params = new URLSearchParams({
      chainid: String(CHAIN_ID),
      module: "account",
      action,
      address,
      startblock: "0",
      endblock: "latest",
      page: String(page),
      offset: String(limit),
      sort: "desc",
      apikey: apiKey!,
    });
    const data = await fetchJson(`${BASE_URL}?${params}`, {
      provider: PROVIDER,
      schema: listResponse(row),
      revalidate,
    });

    if (typeof data.result !== "string") return data.result;
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

  return {
    chain: "ethereum",

    async fetchTransactions(address: string, options: FetchTransactionsOptions = {}) {
      if (!apiKey) {
        throw new UpstreamError("UPSTREAM_ERROR", "ETHERSCAN_API_KEY is not configured", {
          provider: PROVIDER,
        });
      }

      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_WINDOW);
      const cursor = decodeEthCursor(options.cursor);
      const get = <T extends z.ZodTypeAny>(
        action: "txlist" | "tokentx" | "txlistinternal",
        row: T,
        page: number | null,
      ) =>
        page === null
          ? Promise.resolve(null)
          : fetchList(action, row, address, page, limit, options.revalidate);

      // Normal history is the core: its failure fails the page. Tokens and
      // internal transfers are enrichment: on failure their cursor stays
      // put, so "Load older" retries them instead of silently skipping.
      const [normal, tokens, internal] = await Promise.all([
        get("txlist", etherscanTxSchema, cursor.normal),
        get("tokentx", tokenTxSchema, cursor.tokens).catch(() => undefined),
        get("txlistinternal", internalTxSchema, cursor.internal).catch(() => undefined),
      ]);

      const kinds = await resolveCodeKinds(
        addressesNeedingCodeCheck(normal ?? [], address),
        apiKey,
      );

      const nativeTxs = (normal ?? []).map((tx) =>
        normalizeEtherscanTx(tx, address, kinds),
      );
      const internalTxs = (internal ?? [])
        // Zero-value internal calls are plumbing, not money movement.
        .filter((t) => t.value !== "0" || t.isError === "1")
        .map((t) => normalizeInternalTx(t, address));
      const tokenTxs = (tokens ?? []).map((t) => normalizeTokenTx(t, address));

      /** Next page for one list: null when exhausted or past the 10k window. */
      const advance = (page: number | null, rows: unknown[] | null | undefined) => {
        if (page === null) return null;
        if (rows === undefined) return page; // failed: retry this page next time
        const full = rows !== null && rows.length === limit;
        return full && (page + 1) * limit <= MAX_WINDOW ? page + 1 : null;
      };

      return {
        transactions: sortNewestFirst(
          transactionListSchema.parse(
            mergeTokenTransfers([...nativeTxs, ...internalTxs], tokenTxs),
          ),
        ),
        nextCursor: encodeEthCursor({
          normal: advance(cursor.normal, normal),
          tokens: advance(cursor.tokens, tokens),
          internal: advance(cursor.internal, internal),
        }),
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
