import { env } from "@/lib/env";
import type { Chain } from "@/lib/schemas/chain";

import type { ChainAdapter } from "./adapter";
import { createBitcoinAdapter, DEFAULT_ESPLORA_BASE_URL } from "./bitcoin";
import { createEthereumAdapter } from "./ethereum";
import { createTronAdapter } from "./tron";

export type { ChainAdapter, FetchTransactionsOptions } from "./adapter";
export {
  isValidAddress,
  normalizeAddress,
  sameAddress,
  truncateAddress,
} from "./address";
export { isUpstreamError, UpstreamError, type UpstreamErrorCode } from "./errors";

let registry: Record<Chain, ChainAdapter> | undefined;

/**
 * Adapters are built lazily from the validated environment so importing this
 * module in a test never touches process.env.
 */
export function getAdapter(chain: Chain): ChainAdapter {
  if (!registry) {
    const e = env();
    registry = {
      bitcoin: createBitcoinAdapter(e.ESPLORA_BASE_URL ?? DEFAULT_ESPLORA_BASE_URL),
      ethereum: createEthereumAdapter(e.ETHERSCAN_API_KEY),
      tron: createTronAdapter(e.TRONGRID_API_KEY),
    };
  }
  return registry[chain];
}
