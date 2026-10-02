import Link from "next/link";

import { RadarScope } from "@/components/common/radar-scope";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WalletSearch } from "@/components/search/wallet-search";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center"
      >
        <RadarScope className="w-28" blips={[]} />
        <p className="mt-8 mono-data text-xs tracking-widest text-primary uppercase">
          404 · no signal
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Nothing on the radar here
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn&apos;t exist, or the address in the link isn&apos;t a valid
          Bitcoin, Ethereum or Tron address.
        </p>
        <WalletSearch className="mt-8" />
        <Link
          href="/"
          className="mt-6 text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to home
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
