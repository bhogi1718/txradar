import { ShieldQuestion } from "lucide-react";

import { EntityTag } from "@/components/common/entity-tag";
import type { ExposureSummary } from "@/lib/analytics/entities";
import { formatAmount, formatCount } from "@/lib/format";

export function EntitiesPanel({
  exposure,
  symbol,
  onSelect,
}: {
  exposure: ExposureSummary;
  symbol: string;
  /** Filter the table to this entity. */
  onSelect?: (name: string) => void;
}) {
  const pct = Math.round(exposure.exchangeShare * 100);

  return (
    <section className="flex flex-col rounded-xl border border-border/70 bg-card/70 p-4 backdrop-blur sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Known entities</h2>
          <p className="text-xs text-muted-foreground">
            Counterparties matched against verified explorer labels
          </p>
        </div>
        {exposure.entities.length > 0 && (
          <div className="text-right">
            <div className="mono-data text-lg leading-none font-semibold text-chain-btc">
              {pct}%
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              of {symbol} volume via exchanges
            </div>
          </div>
        )}
      </div>

      {exposure.entities.length === 0 ? (
        <div className="mt-4 flex flex-1 items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <ShieldQuestion className="size-5 shrink-0" />
          None of this wallet&apos;s counterparties are in the label set. Labels cover
          major exchanges and contracts only, so unlabeled doesn&apos;t mean unknown to
          everyone.
        </div>
      ) : (
        <>
          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${pct}% of ${symbol} volume involved known exchanges`}
          >
            <div
              className="h-full rounded-full bg-chain-btc"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ul className="mt-4 divide-y divide-border/60">
            {exposure.entities.slice(0, 6).map((e) => (
              <li key={`${e.label.chain}:${e.label.address}`}>
                <button
                  type="button"
                  onClick={() => onSelect?.(e.label.name)}
                  className="flex w-full items-center gap-3 rounded-md py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                  title="Show these transactions"
                >
                  <EntityTag label={e.label} />
                  <span className="ml-auto flex items-center gap-3 text-xs">
                    {e.inflow > 0 && (
                      <span className="mono-data text-inflow">
                        +{formatAmount(e.inflow)}
                      </span>
                    )}
                    {e.outflow > 0 && (
                      <span className="mono-data text-outflow">
                        −{formatAmount(e.outflow)}
                      </span>
                    )}
                    <span className="w-14 text-right mono-data text-muted-foreground">
                      {formatCount(e.count)} tx
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
