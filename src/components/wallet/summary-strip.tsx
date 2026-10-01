import { ArrowDownLeft, ArrowUpRight, Flame, Scale } from "lucide-react";
import type { ReactNode } from "react";

import type { WalletSummary } from "@/lib/analytics/summary";
import { formatAmount, formatCount, formatDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

function Tile({
  label,
  icon,
  value,
  sub,
  tone,
  emphasis = false,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  sub: ReactNode;
  tone?: "in" | "out" | "neutral";
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card/70 p-4 backdrop-blur",
        emphasis ? "border-primary/30" : "border-border/70",
      )}
    >
      {emphasis && (
        <div className="pointer-events-none absolute -top-12 -right-12 size-32 rounded-full bg-primary/10 blur-2xl" />
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium tracking-wide uppercase">{label}</span>
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md",
            tone === "in" && "bg-inflow/10 text-inflow",
            tone === "out" && "bg-outflow/10 text-outflow",
            (!tone || tone === "neutral") && "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 truncate">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function SummaryStrip({
  summary,
  symbol,
  price,
}: {
  summary: WalletSummary;
  symbol: string;
  /** Current USD price; values are shown at today's price, labeled as such. */
  price: number | undefined;
}) {
  const usd = (v: number, signed = false) =>
    price !== undefined ? formatUsd(v * price, { signed, compact: true }) : null;

  const netTone = summary.net > 0 ? "in" : summary.net < 0 ? "out" : "neutral";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        emphasis
        label="Net flow"
        icon={<Scale className="size-3.5" />}
        tone={netTone}
        value={
          <span
            className={cn(
              "mono-data text-2xl font-semibold",
              netTone === "in" && "text-inflow",
              netTone === "out" && "text-outflow",
            )}
          >
            {formatAmount(summary.net, { signed: true })}{" "}
            <span className="text-sm font-normal text-muted-foreground">{symbol}</span>
          </span>
        }
        sub={
          usd(summary.net, true)
            ? `≈ ${usd(summary.net, true)} at today's price`
            : "Received − sent − fees"
        }
      />
      <Tile
        label="Received"
        icon={<ArrowDownLeft className="size-3.5" />}
        tone="in"
        value={
          <span className="mono-data text-2xl font-semibold">
            {formatAmount(summary.inflow)}{" "}
            <span className="text-sm font-normal text-muted-foreground">{symbol}</span>
          </span>
        }
        sub={
          <>
            {formatCount(summary.counts.in)} inbound
            {usd(summary.inflow) && <> · ≈ {usd(summary.inflow)}</>}
          </>
        }
      />
      <Tile
        label="Sent"
        icon={<ArrowUpRight className="size-3.5" />}
        tone="out"
        value={
          <span className="mono-data text-2xl font-semibold">
            {formatAmount(summary.outflow)}{" "}
            <span className="text-sm font-normal text-muted-foreground">{symbol}</span>
          </span>
        }
        sub={
          <>
            {formatCount(summary.counts.out)} outbound
            {usd(summary.outflow) && <> · ≈ {usd(summary.outflow)}</>}
          </>
        }
      />
      <Tile
        label="Fees paid"
        icon={<Flame className="size-3.5" />}
        value={
          <span className="mono-data text-2xl font-semibold">
            {formatAmount(summary.fees)}{" "}
            <span className="text-sm font-normal text-muted-foreground">{symbol}</span>
          </span>
        }
        sub={
          summary.firstSeen !== null && summary.lastSeen !== null
            ? `${formatCount(summary.counterparties)} counterparties · ${formatDate(summary.firstSeen)} – ${formatDate(summary.lastSeen)}`
            : `${formatCount(summary.counterparties)} counterparties`
        }
      />
    </div>
  );
}
