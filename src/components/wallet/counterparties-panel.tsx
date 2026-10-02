import { ChevronRight, Users } from "lucide-react";

import { EntityTag } from "@/components/common/entity-tag";
import type { CounterpartySummary } from "@/lib/analytics/counterparties";
import { truncateAddress } from "@/lib/chains/address";
import { formatAmount, formatCount, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CounterpartiesPanel({
  counterparties,
  symbol,
  onOpen,
}: {
  counterparties: CounterpartySummary[];
  symbol: string;
  onOpen: (address: string) => void;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-border/70 bg-card/70 p-4 backdrop-blur sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Top counterparties</h2>
          <p className="text-xs text-muted-foreground">
            Who this wallet deals with most · net {symbol} from its side
          </p>
        </div>
        <span className="mono-data text-xs text-muted-foreground">
          {formatCount(counterparties.length)} total
        </span>
      </div>

      {counterparties.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Users className="size-5 shrink-0" />
          No counterparties in this window.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border/60">
          {counterparties.slice(0, 7).map((c) => (
            <li key={c.address}>
              <button
                type="button"
                onClick={() => onOpen(c.address)}
                className="group flex w-full items-center gap-3 rounded-md py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                title={`Inspect ${c.address}`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {c.label ? (
                    <EntityTag label={c.label} />
                  ) : (
                    <span className="truncate mono-data text-[13px]">
                      {truncateAddress(c.address)}
                    </span>
                  )}
                </span>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  {formatRelative(c.lastSeen)}
                </span>
                <span
                  className={cn(
                    "w-24 text-right mono-data text-xs",
                    c.net > 0 && "text-inflow",
                    c.net < 0 && "text-outflow",
                    c.net === 0 && "text-muted-foreground",
                  )}
                >
                  {c.net === 0 && c.tokenTransfers > 0
                    ? "tokens"
                    : formatAmount(c.net, { signed: true })}
                </span>
                <span className="w-12 text-right mono-data text-xs text-muted-foreground">
                  {formatCount(c.count)} tx
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
