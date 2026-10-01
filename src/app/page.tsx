import { ArrowDownLeft, ArrowUpRight, Link2, Network } from "lucide-react";

import { RadarScope } from "@/components/common/radar-scope";
import { PriceTicker } from "@/components/home/price-ticker";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SampleWallets } from "@/components/search/sample-wallets";
import { WalletSearch } from "@/components/search/wallet-search";

const FEATURES = [
  {
    icon: ArrowDownLeft,
    title: "Inflows & outflows",
    body: "Net flow per wallet, computed from the wallet's side of every transaction — including multi-party Bitcoin txs.",
  },
  {
    icon: Network,
    title: "Counterparties",
    body: "Every counterparty address, searchable — see who this wallet deals with at a glance.",
  },
  {
    icon: Link2,
    title: "Shareable views",
    body: "Filters live in the URL — send a link and the other person sees exactly what you see.",
  },
  {
    icon: ArrowUpRight,
    title: "One source of truth",
    body: "Bitcoin, Ethereum and Tron normalized into the same shape, side by side.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 overflow-hidden px-4 pt-16 pb-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-24">
          <div className="relative z-10 min-w-0">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 mono-data text-[11px] tracking-widest text-primary uppercase">
              <span className="size-1.5 animate-blip rounded-full bg-primary" />
              BTC · ETH · TRX
            </p>
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              See where the
              <br />
              money <span className="text-primary text-glow">moves.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base text-pretty text-muted-foreground sm:text-lg">
              Paste any wallet address. TxRadar detects the chain, pulls its history and
              maps every inflow, outflow and counterparty.
            </p>

            <WalletSearch autoFocus className="mt-8 max-w-xl" />
            <SampleWallets className="mt-5 max-w-xl" />
          </div>

          <div className="relative mx-auto hidden w-full max-w-md lg:block">
            <RadarScope className="w-full" />
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 mono-data text-[11px] tracking-widest text-muted-foreground uppercase">
              scanning mainnets
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6">
          <PriceTicker />
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">
          <div className="grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-card/80 p-5">
                <Icon className="size-5 text-primary" aria-hidden />
                <h2 className="mt-3 text-sm font-semibold">{title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
