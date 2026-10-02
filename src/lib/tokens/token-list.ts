import { z } from "zod";

import { sharedCache } from "@/lib/cache";
import { fetchJson } from "@/lib/chains/http";
import { CHAIN_META, type Chain } from "@/lib/schemas/chain";
import type { Transaction } from "@/lib/schemas/transaction";

/**
 * CoinGecko's public token lists (Uniswap token-list format): every token
 * CoinGecko tracks on a chain. "Listed" means recognized by a major data
 * provider — not endorsed or safe — but it cleanly separates real tokens
 * from the flood of airdropped spam that busy wallets receive.
 */
const PROVIDER = "coingecko-tokens";
const BASE_URL = "https://tokens.coingecko.com";
/** The lists change slowly; once a day is plenty. */
const TTL_MS = 24 * 3600 * 1000;

const tokenListSchema = z.object({
  tokens: z.array(z.object({ address: z.string() })),
});

const cache = sharedCache<string[]>("token-list", { maxEntries: 4 });

/** EVM addresses compare case-insensitively; base58 (Tron) does not. */
function key(chain: Chain, address: string): string {
  return chain === "ethereum" ? address.toLowerCase() : address;
}

/** Recognized token contracts on a chain, or null when the chain has no tokens. */
export async function loadTokenList(chain: Chain): Promise<Set<string> | null> {
  if (chain === "bitcoin") return null;
  const { value } = await cache.getOrLoad(chain, TTL_MS, async () => {
    const data = await fetchJson(
      `${BASE_URL}/${CHAIN_META[chain].coingeckoPlatform}/all.json`,
      {
        provider: PROVIDER,
        schema: tokenListSchema,
        revalidate: 0,
        timeoutMs: 20_000,
      },
    );
    return data.tokens.map((t) => key(chain, t.address));
  });
  return new Set(value);
}

/**
 * Tag each token transfer with whether its contract is on the list. Assets
 * without a real contract (Tron TRC-10 ids) are never listed. Native coins
 * and an unavailable list leave `listed` unset ("unknown").
 */
export function annotateListed(
  txs: readonly Transaction[],
  list: Set<string> | null,
): Transaction[] {
  if (!list) return [...txs];
  return txs.map((tx) => {
    const contract = tx.asset.contract;
    if (contract === null) return tx;
    return { ...tx, asset: { ...tx.asset, listed: list.has(key(tx.chain, contract)) } };
  });
}
