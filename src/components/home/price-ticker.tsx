"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { ChainGlyph } from "@/components/common/chain-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrices } from "@/hooks/use-prices";
import { formatPercent, formatUsd } from "@/lib/format";
import { CHAIN_META, CHAINS } from "@/lib/schemas/chain";
import { cn } from "@/lib/utils";

/** Live USD prices for the three tracked chains. Fails quietly — it's context, not content. */
export function PriceTicker({ className }: { className?: string }) {
  const { data, isPending, isError } = usePrices();

  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {CHAINS.map((chain) => {
        const meta = CHAIN_META[chain];
        const quote = data?.prices[chain];
        const change = quote?.change24h ?? null;
        const up = change !== null && change >= 0;

        return (
          <div
            key={chain}
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-3 backdrop-blur"
          >
            <ChainGlyph chain={chain} className="size-9 text-base" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-medium">{meta.name}</span>
                <span className="mono-data text-[11px] text-muted-foreground">
                  {meta.symbol}
                </span>
              </div>
              {isPending ? (
                <Skeleton className="mt-1 h-5 w-24" />
              ) : quote ? (
                <div className="mono-data text-lg leading-tight font-semibold">
                  {formatUsd(quote.usd)}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {isError ? "Price unavailable" : "—"}
                </div>
              )}
            </div>
            {change !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 mono-data text-xs",
                  up ? "bg-inflow/10 text-inflow" : "bg-outflow/10 text-outflow",
                )}
                title="24h change"
              >
                {up ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                {formatPercent(change)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
