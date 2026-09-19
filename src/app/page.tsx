import { RadarMark } from "@/components/brand/radar-mark";
import { SiteHeader } from "@/components/layout/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4 py-24 sm:px-6">
        <RadarMark sweeping className="size-20 text-primary text-glow" />
        <h1 className="mt-8 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          Tx<span className="text-primary">Radar</span>
        </h1>
        <p className="mt-3 max-w-md text-center text-balance text-muted-foreground">
          Wallet activity across Bitcoin, Ethereum and Tron — inflows, outflows,
          counterparties and exchange exposure in one view.
        </p>
      </main>
    </>
  );
}
