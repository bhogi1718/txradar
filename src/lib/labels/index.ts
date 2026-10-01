import type { Chain } from "@/lib/schemas/chain";

import { LABELS, type AddressLabel } from "./registry";

export type { AddressLabel, LabelKind } from "./registry";

/** Lookup key: EVM addresses compare case-insensitively, base58 does not. */
function key(chain: Chain, address: string): string {
  const canonical =
    chain === "ethereum" || address.toLowerCase().startsWith("bc1")
      ? address.toLowerCase()
      : address;
  return `${chain}:${canonical}`;
}

const index = new Map<string, AddressLabel>(
  LABELS.map((l) => [key(l.chain, l.address), l]),
);

export function getLabel(
  chain: Chain,
  address: string | null | undefined,
): AddressLabel | null {
  if (!address) return null;
  return index.get(key(chain, address)) ?? null;
}
