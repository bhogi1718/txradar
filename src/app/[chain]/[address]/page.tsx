import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ScanningState } from "@/components/wallet/states";
import { WalletView } from "@/components/wallet/wallet-view";
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

export default async function WalletPage(props: PageProps<"/[chain]/[address]">) {
  const resolved = resolve(await props.params);
  if (!resolved) notFound();

  const { chain, address } = resolved;
  const canonical = normalizeAddress(chain, address);
  // One URL per wallet: 0xABC… and 0xabc… share a cache entry and a history slot.
  if (canonical !== address) redirect(`/${chain}/${canonical}`);

  return (
    <>
      <SiteHeader showSearch />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {/* useSearchParams (filters) needs a Suspense boundary for prerendering. */}
        <Suspense fallback={<ScanningState chain={chain} />}>
          <WalletView chain={chain} address={canonical} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
