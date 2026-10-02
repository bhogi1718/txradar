import { TriangleAlert } from "lucide-react";

import { truncateAddress } from "@/lib/chains/address";
import { ILLIQUID_SHARE } from "@/lib/analytics/valuation";
import { isIlliquid, type TokenSummary } from "@/lib/analytics/tokens";
import { formatAmount, formatCount, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TokensPanel({
  tokens,
  onSelect,
}: {
  tokens: TokenSummary[];
  onSelect?: (symbol: string) => void;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-border/70 bg-card/70 p-4 backdrop-blur sm:p-5">
      <div>
        <h2 className="text-sm font-semibold">Tokens</h2>
        <p className="text-xs text-muted-foreground">
          Token transfers in this window · USD at today&apos;s price
        </p>
      </div>
      <ul className="mt-4 divide-y divide-border/60">
        {tokens.slice(0, 6).map((t) => {
          const net = t.inflow - t.outflow;
          const unverified = t.priceStatus === "unpriced";
          return (
            <li key={t.asset.contract}>
              <button
                type="button"
                onClick={() => onSelect?.(t.asset.symbol)}
                className="flex w-full items-center gap-3 rounded-md py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                title={`${t.asset.contract} — show these transactions`}
              >
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1",
                    unverified
                      ? "bg-muted text-muted-foreground ring-border"
                      : "bg-primary/10 text-primary ring-primary/25",
                  )}
                  aria-hidden
                >
                  {t.asset.symbol.slice(0, 4).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{t.asset.symbol}</span>
                    {unverified && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1 text-[10px] text-destructive">
                        <TriangleAlert className="size-2.5" /> unverified
                      </span>
                    )}
                  </span>
                  <span className="block mono-data text-[11px] text-muted-foreground">
                    {truncateAddress(t.asset.contract)} · {formatCount(t.count)} tx
                  </span>
                </span>
                <span className="ml-auto text-right">
                  <span
                    className={cn(
                      "block mono-data text-sm",
                      net > 0 && "text-inflow",
                      net < 0 && "text-outflow",
                    )}
                  >
                    {formatAmount(net, { signed: true })}
                  </span>
                  <span className="block mono-data text-[11px] text-muted-foreground">
                    {t.price !== null && isIlliquid(t) ? (
                      <span
                        className="text-chain-btc"
                        title={`Worth more than ${ILLIQUID_SHARE * 100}% of this token's whole market cap — it couldn't be sold anywhere near this price.`}
                      >
                        illiquid ·{" "}
                        {formatUsd(net * t.price, { signed: true, compact: true })}
                      </span>
                    ) : t.price !== null ? (
                      formatUsd(net * t.price, { signed: true })
                    ) : t.priceStatus === "unpriced" ? (
                      "no price"
                    ) : (
                      "price unavailable"
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {tokens.some((t) => t.priceStatus === "unpriced") && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Unverified tokens have no market price. On Tron these are usually spam airdrops
          — don&apos;t interact with them.
        </p>
      )}
    </section>
  );
}
