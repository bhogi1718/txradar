import { CHAINS, type Chain } from "@/lib/schemas/chain";

import { isValidAddress } from "./address";

/**
 * Which chains could this string be an address on? Address formats on our
 * three chains don't overlap, so in practice this is zero or one result —
 * but returning a list keeps the UI honest if an EVM chain is ever added
 * (every 0x address is valid on every EVM chain).
 */
export function detectChains(raw: string): Chain[] {
  const address = raw.trim();
  if (!address) return [];
  return CHAINS.filter((chain) => isValidAddress(chain, address));
}

/** Best single guess, or null when the input matches no chain. */
export function detectChain(raw: string): Chain | null {
  return detectChains(raw)[0] ?? null;
}

/**
 * A softer check for typing-in-progress: does the input *look like* it's
 * heading toward a given chain's format? Used to show a hint before the
 * address is complete ("Looks like Ethereum — 12 more characters").
 */
export function guessChainFromPrefix(raw: string): Chain | null {
  const s = raw.trim();
  if (/^0x[0-9a-fA-F]*$/.test(s) && s.length >= 2) return "ethereum";
  if (/^T[1-9A-HJ-NP-Za-km-z]*$/.test(s)) return "tron";
  if (/^(bc1|BC1)[0-9a-zA-Z]*$/.test(s) || /^[13][1-9A-HJ-NP-Za-km-z]*$/.test(s)) {
    return "bitcoin";
  }
  return null;
}
