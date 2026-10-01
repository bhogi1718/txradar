"use client";

import { History, X } from "lucide-react";
import Link from "next/link";

import { ChainGlyph } from "@/components/common/chain-badge";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { truncateAddress } from "@/lib/chains/address";
import type { Chain } from "@/lib/schemas/chain";
import { cn } from "@/lib/utils";

const SAMPLES: { chain: Chain; address: string; label: string }[] = [
  {
    chain: "ethereum",
    address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    label: "Busy ETH wallet",
  },
  {
    chain: "bitcoin",
    address: "bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun",
    label: "Active BTC wallet",
  },
  { chain: "tron", address: "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy", label: "TRX wallet" },
];

const chip =
  "inline-flex h-8 items-center gap-2 rounded-full border border-border/70 bg-surface/80 pr-3 pl-1 text-xs text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function SampleWallets({ className }: { className?: string }) {
  const { recent, remove } = useRecentSearches();

  return (
    <div className={cn("space-y-3", className)}>
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <History className="size-3.5" /> Recent
          </span>
          {recent.map((r) => (
            <span
              key={`${r.chain}:${r.address}`}
              className="group/chip relative inline-flex"
            >
              <Link href={`/${r.chain}/${r.address}`} className={cn(chip, "pr-7")}>
                <ChainGlyph chain={r.chain} className="size-6 text-[11px]" />
                <span className="mono-data text-foreground/90">
                  {truncateAddress(r.address)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(r.chain, r.address)}
                aria-label={`Remove ${truncateAddress(r.address)} from recent`}
                className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground opacity-60 outline-none hover:bg-muted hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted-foreground">Try</span>
        {SAMPLES.map((s) => (
          <Link key={s.address} href={`/${s.chain}/${s.address}`} className={chip}>
            <ChainGlyph chain={s.chain} className="size-6 text-[11px]" />
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
