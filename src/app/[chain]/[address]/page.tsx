import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WalletView } from "@/components/wallet/wallet-view";
import { parseFilterParams } from "@/lib/analytics/filters";
import { isValidAddress, normalizeAddress, truncateAddress } from "@/lib/chains/address";
import { CHAIN_META, chainSchema, type Chain } from "@/lib/schemas/chain";

type Params = { chain: string; address: string };

function resolve(params: Params): { chain: Chain; address: string } | null {
  const chain = chainSchema.safeParse(params.chain);
  if (!chain.success) return null;
  const address = decodeURIComponent(params.address);
  if (!isValidAddress(chain.data, address)) return null;
  return { chain: chain.data, address };
}

export async function generateMetadata(
  props: PageProps<"/[chain]/[address]">,
): Promise<Metadata> {
  const resolved = resolve(await props.params);
  if (!resolved) return { title: "Not found" };
  return {
    title: `${truncateAddress(resolved.address)} · ${CHAIN_META[resolved.chain].name}`,
  };
}

/** Next passes repeated keys as arrays; filters only ever use the first value. */
function toSearchParams(
  raw: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (first !== undefined) out.set(k, first);
  }
  return out;
}

export default async function WalletPage(props: PageProps<"/[chain]/[address]">) {
  const resolved = resolve(await props.params);
  if (!resolved) notFound();

  const { chain, address } = resolved;
  const canonical = normalizeAddress(chain, address);
  const search = toSearchParams(await props.searchParams);
  // One URL per wallet: 0xABC… and 0xabc… share a cache entry and a history slot.
  if (canonical !== address) {
    const qs = search.toString();
    redirect(`/${chain}/${canonical}${qs ? `?${qs}` : ""}`);
  }

  return (
    <>
      <SiteHeader showSearch />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <WalletView
          // Remount on wallet change so filter state never leaks between wallets.
          key={`${chain}:${canonical}`}
          chain={chain}
          address={canonical}
          initialFilters={parseFilterParams(search)}
        />
      </main>
      <SiteFooter />
    </>
  );
}
