import type { Chain } from "@/lib/schemas/chain";

import { isValidTronAddress } from "./tron-address";

/**
 * Format-level validation + canonical casing per chain. This is what the
 * form validates against before a request is ever sent, and what adapters
 * use to compare addresses in explorer responses.
 *
 * Bitcoin: legacy/P2SH are case-sensitive base58; bech32(m) must be
 * single-case and is canonically lowercase. We accept mixed-case input for
 * bech32 only if it is *entirely* one case (per BIP-173).
 */

const ETH_RE = /^0x[0-9a-fA-F]{40}$/;
const BTC_LEGACY_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const BTC_BECH32_RE = /^bc1[ac-hj-np-z02-9]{11,87}$/;

function isSingleCase(s: string): boolean {
  return s === s.toLowerCase() || s === s.toUpperCase();
}

export function isValidAddress(chain: Chain, raw: string): boolean {
  const address = raw.trim();
  switch (chain) {
    case "ethereum":
      return ETH_RE.test(address);
    case "bitcoin":
      if (BTC_LEGACY_RE.test(address)) return true;
      return isSingleCase(address) && BTC_BECH32_RE.test(address.toLowerCase());
    case "tron":
      return isValidTronAddress(address);
  }
}

/**
 * Canonical form used for equality checks and cache keys.
 * Throws if the address is invalid — callers must validate first.
 */
export function normalizeAddress(chain: Chain, raw: string): string {
  const address = raw.trim();
  if (!isValidAddress(chain, address)) {
    throw new TypeError(`Invalid ${chain} address: ${raw}`);
  }
  switch (chain) {
    case "ethereum":
      return address.toLowerCase();
    case "bitcoin":
      return address.toLowerCase().startsWith("bc1") ? address.toLowerCase() : address;
    case "tron":
      return address;
  }
}

/** Compare two addresses on a chain ignoring cosmetic casing differences. */
export function sameAddress(chain: Chain, a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  switch (chain) {
    case "ethereum":
      return a.toLowerCase() === b.toLowerCase();
    case "bitcoin":
      return a.toLowerCase().startsWith("bc1")
        ? a.toLowerCase() === b.toLowerCase()
        : a === b;
    case "tron":
      return a === b;
  }
}

/** Shorten for display: 0x1234…abcd. */
export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
