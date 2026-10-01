"use client";

import { useMemo, useState } from "react";

import { Segmented } from "@/components/common/segmented";
import { bucketize, type FlowBucket, type Granularity } from "@/lib/analytics/buckets";
import { formatAmount, formatCount } from "@/lib/format";
import type { Transaction } from "@/lib/schemas/transaction";
import { cn } from "@/lib/utils";

const LABEL_FMT: Record<Granularity, Intl.DateTimeFormatOptions> = {
  hour: {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  },
  day: { month: "short", day: "numeric" },
  week: { month: "short", day: "numeric" },
  month: { month: "short", year: "numeric" },
};

const UNIT: Record<Granularity, string> = {
  hour: "per hour",
  day: "per day",
  week: "per week",
  month: "per month",
};

function fmtBucket(ts: number, g: Granularity) {
  return new Intl.DateTimeFormat("en-US", { ...LABEL_FMT[g], timeZone: "UTC" }).format(
    ts,
  );
}

function bucketTitle(b: FlowBucket, g: Granularity) {
  if (g === "week") return `Week of ${fmtBucket(b.start, "day")}`;
  return fmtBucket(b.start, g);
}

type Scale = "log" | "linear";

/**
 * Bar height as a share of the half-chart. Wallet flows are heavy-tailed —
 * one whale transfer can be 10^7× the median — so log scale (relative to the
 * smallest non-zero bucket) is the default; linear is one click away.
 * Non-zero values always stay visible.
 */
function barHeight(value: number, max: number, minPositive: number, scale: Scale) {
  if (value <= 0 || max <= 0) return "0px";
  const share =
    scale === "linear" || minPositive >= max
      ? value / max
      : Math.log10(1 + value / minPositive) / Math.log10(1 + max / minPositive);
  return `max(2px, ${share * 100}%)`;
}

export function FlowChart({
  txs,
  symbol,
  range,
}: {
  txs: readonly Transaction[];
  symbol: string;
  /** Window to plot; omitted = span of the data. */
  range?: { from: number; to: number };
}) {
  const { granularity, buckets } = useMemo(() => bucketize(txs, { range }), [txs, range]);
  const [active, setActive] = useState<number | null>(null);
  const [scale, setScale] = useState<Scale>("log");

  const { max, minPositive } = useMemo(() => {
    let max = 0;
    let minPositive = Infinity;
    for (const b of buckets) {
      for (const v of [b.inflow, b.outflow]) {
        if (v > max) max = v;
        if (v > 0 && v < minPositive) minPositive = v;
      }
    }
    return { max, minPositive: Number.isFinite(minPositive) ? minPositive : 0 };
  }, [buckets]);
  const totals = useMemo(
    () =>
      buckets.reduce(
        (t, b) => ({ inflow: t.inflow + b.inflow, outflow: t.outflow + b.outflow }),
        { inflow: 0, outflow: 0 },
      ),
    [buckets],
  );

  const labelIdx = useMemo(() => {
    const n = buckets.length;
    if (n <= 1) return n === 1 ? [0] : [];
    const count = Math.min(5, n);
    return Array.from({ length: count }, (_, i) =>
      Math.round((i * (n - 1)) / (count - 1)),
    );
  }, [buckets.length]);

  const hovered = active !== null ? buckets[active] : undefined;

  return (
    <section className="rounded-xl border border-border/70 bg-card/70 p-4 backdrop-blur sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Flow timeline</h2>
          <p className="text-xs text-muted-foreground">
            {symbol} moved {UNIT[granularity]} · UTC{scale === "log" && " · log scale"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <Segmented<Scale>
            aria-label="Chart scale"
            size="sm"
            value={scale}
            onChange={setScale}
            options={[
              { value: "log", label: "Log" },
              { value: "linear", label: "Linear" },
            ]}
          />
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-inflow" />
            <span className="text-muted-foreground">In</span>
            <span className="mono-data">{formatAmount(totals.inflow)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-outflow" />
            <span className="text-muted-foreground">Out</span>
            <span className="mono-data">{formatAmount(totals.outflow)}</span>
          </span>
        </div>
      </div>

      {buckets.length === 0 || max === 0 ? (
        <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No value moved in this window.
        </div>
      ) : (
        <div
          className="relative mt-4"
          role="img"
          aria-label={`Flow timeline: ${formatAmount(totals.inflow)} ${symbol} in and ${formatAmount(totals.outflow)} ${symbol} out across ${buckets.length} ${granularity}s.`}
          onMouseLeave={() => setActive(null)}
        >
          {/* bars */}
          <div className="relative flex h-48 items-stretch">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border" />
            {buckets.map((b, i) => (
              <div
                key={b.start}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col px-px",
                  active === i && "bg-primary/5",
                )}
                onMouseEnter={() => setActive(i)}
              >
                <div className="flex flex-1 items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-[2px] bg-inflow/80 transition-colors",
                      active === i && "bg-inflow",
                    )}
                    style={{ height: barHeight(b.inflow, max, minPositive, scale) }}
                  />
                </div>
                <div className="flex flex-1 items-start">
                  <div
                    className={cn(
                      "w-full rounded-b-[2px] bg-outflow/75 transition-colors",
                      active === i && "bg-outflow",
                    )}
                    style={{ height: barHeight(b.outflow, max, minPositive, scale) }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* x labels */}
          <div className="relative mt-2 h-4">
            {labelIdx.map((i) => {
              const b = buckets[i]!;
              const pct = ((i + 0.5) / buckets.length) * 100;
              const align =
                i === 0
                  ? "translate-x-0"
                  : i === buckets.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2";
              return (
                <span
                  key={b.start}
                  className={cn(
                    "absolute top-0 mono-data text-[10px] whitespace-nowrap text-muted-foreground",
                    align,
                  )}
                  style={{
                    left: i === 0 ? 0 : i === buckets.length - 1 ? "100%" : `${pct}%`,
                  }}
                >
                  {fmtBucket(b.start, granularity)}
                </span>
              );
            })}
          </div>

          {/* tooltip */}
          {hovered && active !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 w-48 -translate-y-full rounded-lg border border-border bg-popover/95 p-3 text-xs shadow-xl backdrop-blur"
              style={{
                left: `clamp(0px, calc(${((active + 0.5) / buckets.length) * 100}% - 6rem), calc(100% - 12rem))`,
              }}
            >
              <div className="font-medium">{bucketTitle(hovered, granularity)}</div>
              <dl className="mt-2 space-y-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">In</dt>
                  <dd className="mono-data text-inflow">
                    +{formatAmount(hovered.inflow)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Out</dt>
                  <dd className="mono-data text-outflow">
                    −{formatAmount(hovered.outflow)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-border pt-1">
                  <dt className="text-muted-foreground">Transactions</dt>
                  <dd className="mono-data">{formatCount(hovered.count)}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
