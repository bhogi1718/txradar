"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  Radar,
  RotateCw,
  Search,
  TableProperties,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CopyButton } from "@/components/common/copy-button";
import { SectionBoundary } from "@/components/common/section-boundary";
import { EntityTag, entityKindLabel } from "@/components/common/entity-tag";
import { RadarScope } from "@/components/common/radar-scope";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useTransactions } from "@/hooks/use-transactions";
import {
  summarizeCounterparties,
  transactionsWith,
} from "@/lib/analytics/counterparties";
import { TRAIL_MAX } from "@/lib/analytics/filters";
import { summarize } from "@/lib/analytics/summary";
import { sameAddress, truncateAddress } from "@/lib/chains/address";
import { formatAmount, formatCount, formatDate, formatRelative } from "@/lib/format";
import { getLabel } from "@/lib/labels";
import { CHAIN_META, type Chain } from "@/lib/schemas/chain";
import { isNative, type Transaction } from "@/lib/schemas/transaction";
import { cn } from "@/lib/utils";

type InspectorProps = {
  chain: Chain;
  /** The wallet the page is about. */
  root: string;
  /** Drill-down path, outermost first. Empty = closed. */
  trail: string[];
  onTrailChange: (trail: string[]) => void;
  /** Filter the main table to the current counterparty (first hop only). */
  onShowInTable?: (address: string) => void;
};

/**
 * Side sheet for following money: wallet → counterparty → their
 * counterparty… Each hop shows the relationship with the previous address
 * (from data already loaded) and the hop's own recent activity (one fetch,
 * cached by TanStack Query so walking back up the trail is instant).
 */
export function CounterpartyInspector(props: InspectorProps) {
  const { trail, onTrailChange } = props;
  const open = trail.length > 0;
  const current = trail[trail.length - 1];

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onTrailChange([])}>
      <SheetContent side="right" className="w-full! gap-0 p-0 sm:max-w-xl!">
        {/* Remount per hop so per-hop state (e.g. "scan anyway") resets. */}
        {current && (
          <SectionBoundary
            name="counterparty inspector"
            className="m-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm"
          >
            <InspectorBody key={current} {...props} current={current} />
          </SectionBoundary>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InspectorBody({
  chain,
  root,
  trail,
  current,
  onTrailChange,
  onShowInTable,
}: InspectorProps & { current: string }) {
  const meta = CHAIN_META[chain];
  const parent = trail.length > 1 ? trail[trail.length - 2]! : root;
  const label = getLabel(chain, current);

  // Exchanges and contracts have huge, unrelated histories; scan them only on request.
  const [scanRequested, setScanRequested] = useState(false);
  const autoScan = label === null;

  // The root's history is already in the query cache, so this is free at hop 1.
  const parentQuery = useTransactions(chain, parent);
  const ownQuery = useTransactions(chain, current, {
    enabled: autoScan || scanRequested,
  });

  const parentTxs = parentQuery.transactions;
  const ownTxs = ownQuery.transactions;

  const between = useMemo(
    () => transactionsWith(parentTxs, current),
    [parentTxs, current],
  );
  const relation = useMemo(() => summarize(between), [between]);
  const tokenCount = useMemo(() => between.filter((t) => !isNative(t)).length, [between]);

  const ownSummary = useMemo(() => summarize(ownTxs), [ownTxs]);
  const visited = useMemo(() => [root, ...trail], [root, trail]);
  const theirCounterparties = useMemo(
    () =>
      summarizeCounterparties(ownTxs)
        .filter((c) => !visited.some((v) => sameAddress(chain, v, c.address)))
        .slice(0, 6),
    [ownTxs, visited, chain],
  );
  const atMaxDepth = trail.length >= TRAIL_MAX;

  // From the parent's side: inflow = parent received from current.
  const parentName = parent === root ? "this wallet" : truncateAddress(parent);

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="border-b border-border/70 p-4 pr-12">
        <nav
          aria-label="Drill-down path"
          className="flex flex-wrap items-center gap-1 text-xs"
        >
          <button
            type="button"
            onClick={() => onTrailChange([])}
            className="rounded px-1 mono-data text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            title={root}
          >
            {truncateAddress(root, 4, 4)}
          </button>
          {trail.map((addr, i) => {
            const last = i === trail.length - 1;
            return (
              <span key={`${addr}-${i}`} className="inline-flex items-center gap-1">
                <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden />
                {last ? (
                  <span
                    className="rounded bg-primary/10 px-1 mono-data text-primary"
                    aria-current="page"
                  >
                    {truncateAddress(addr, 4, 4)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onTrailChange(trail.slice(0, i + 1))}
                    className="rounded px-1 mono-data text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    title={addr}
                  >
                    {truncateAddress(addr, 4, 4)}
                  </button>
                )}
              </span>
            );
          })}
        </nav>

        <SheetTitle className="mt-3 flex items-center gap-2">
          {label ? <EntityTag label={label} showKind /> : <span>Counterparty</span>}
        </SheetTitle>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="min-w-0 mono-data text-[13px] break-all">{current}</span>
          <CopyButton value={current} label="Copy address" />
        </div>
        <SheetDescription className="sr-only">
          Transactions between {parentName} and {current}, and {current}&apos;s own recent
          activity.
        </SheetDescription>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/${chain}/${current}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Radar className="size-3.5" /> Open as wallet
          </Link>
          {trail.length === 1 && onShowInTable && (
            <button
              type="button"
              onClick={() => onShowInTable(current)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <TableProperties className="size-3.5" /> Show in table
            </button>
          )}
          <a
            href={meta.explorer.address(current)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Explorer <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* relationship with parent */}
        <section aria-labelledby="rel-heading">
          <h3
            id="rel-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            With {parentName}
          </h3>
          {parentQuery.isPending ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat
                  label={`${parentName === "this wallet" ? "Received" : "In"}`}
                  tone="in"
                >
                  {formatAmount(relation.inflow)}
                </Stat>
                <Stat
                  label={`${parentName === "this wallet" ? "Sent" : "Out"}`}
                  tone="out"
                >
                  {formatAmount(relation.outflow)}
                </Stat>
                <Stat label="Transactions">{formatCount(relation.counts.total)}</Stat>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {meta.symbol} amounts from {parentName}&apos;s side
                {relation.counts.failed > 0 && ` · ${relation.counts.failed} failed`}
                {tokenCount > 0 &&
                  ` · ${tokenCount} token transfer${tokenCount === 1 ? "" : "s"}`}
                {relation.firstSeen !== null &&
                  ` · ${formatDate(relation.firstSeen)} – ${formatDate(relation.lastSeen!)}`}
              </p>
              <TxList txs={between} chain={chain} />
            </>
          )}
        </section>

        {/* their activity */}
        <section aria-labelledby="own-heading">
          <h3
            id="own-heading"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Their recent activity
          </h3>

          {!autoScan && !scanRequested ? (
            <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm">
              <p className="text-muted-foreground">
                This is a known {entityKindLabel(label!.kind).toLowerCase()}. Its history
                is busy and mostly unrelated to this wallet.
              </p>
              <button
                type="button"
                onClick={() => setScanRequested(true)}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium outline-none hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search className="size-3.5" /> Scan anyway
              </button>
            </div>
          ) : ownQuery.isPending ? (
            <div
              className="mt-4 flex items-center gap-3 text-sm text-muted-foreground"
              aria-busy="true"
            >
              <RadarScope className="w-10" />
              Scanning {truncateAddress(current)}…
            </div>
          ) : ownQuery.isError ? (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm"
            >
              <p>Couldn&apos;t load their history: {ownQuery.error.message}</p>
              <button
                type="button"
                onClick={() => void ownQuery.refetch()}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCw className="size-3" /> Try again
              </button>
            </div>
          ) : ownTxs.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No transactions on record.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat
                  label="Net flow"
                  tone={
                    ownSummary.net > 0 ? "in" : ownSummary.net < 0 ? "out" : undefined
                  }
                >
                  {formatAmount(ownSummary.net, { signed: true })}
                </Stat>
                <Stat label="In / out">
                  {formatCount(ownSummary.counts.in)} /{" "}
                  {formatCount(ownSummary.counts.out)}
                </Stat>
                <Stat label="Last active">
                  {ownSummary.lastSeen !== null
                    ? formatRelative(ownSummary.lastSeen)
                    : "—"}
                </Stat>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Latest {formatCount(ownTxs.length)} transactions · {meta.symbol}
              </p>

              <h4 className="mt-5 text-xs font-medium text-muted-foreground">
                Follow the money
                {atMaxDepth && (
                  <span className="ml-1 font-normal">
                    · max depth of {TRAIL_MAX} reached
                  </span>
                )}
              </h4>
              {theirCounterparties.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No other counterparties in their recent history.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-border/60">
                  {theirCounterparties.map((c) => (
                    <li key={c.address}>
                      <button
                        type="button"
                        disabled={atMaxDepth}
                        onClick={() => onTrailChange([...trail, c.address])}
                        className="group flex w-full items-center gap-2 rounded-md py-2 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                        title={`Follow to ${c.address}`}
                      >
                        {c.label && <EntityTag label={c.label} />}
                        <span className="min-w-0 flex-1 truncate mono-data text-[13px]">
                          {truncateAddress(c.address, c.label ? 4 : 6, 4)}
                        </span>
                        <span
                          className={cn(
                            "mono-data text-xs",
                            c.net > 0 && "text-inflow",
                            c.net < 0 && "text-outflow",
                            c.net === 0 && "text-muted-foreground",
                          )}
                        >
                          {formatAmount(c.net, { signed: true })}
                        </span>
                        <span className="w-12 text-right mono-data text-xs text-muted-foreground">
                          {formatCount(c.count)} tx
                        </span>
                        <ChevronRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "in" | "out";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 truncate mono-data text-sm font-medium",
          tone === "in" && "text-inflow",
          tone === "out" && "text-outflow",
        )}
      >
        {children}
      </div>
    </div>
  );
}

const LIST_LIMIT = 12;

function TxList({ txs, chain }: { txs: Transaction[]; chain: Chain }) {
  const { explorer } = CHAIN_META[chain];
  if (txs.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No direct transactions in the loaded history.
      </p>
    );
  }
  const shown = [...txs].sort((a, b) => b.timestamp - a.timestamp).slice(0, LIST_LIMIT);
  return (
    <ul className="mt-3 divide-y divide-border/50 rounded-lg border border-border/70">
      {shown.map((tx, i) => {
        const out = tx.direction === "out";
        const failed = tx.status === "failed";
        return (
          <li
            key={`${tx.hash}-${i}`}
            className="flex items-center gap-2 px-3 py-2 text-xs"
          >
            <span
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                out ? "bg-outflow/10 text-outflow" : "bg-inflow/10 text-inflow",
              )}
              aria-label={out ? "Outgoing" : "Incoming"}
            >
              {out ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownLeft className="size-3" />
              )}
            </span>
            <span
              className="text-muted-foreground"
              title={new Date(tx.timestamp).toISOString()}
            >
              {formatRelative(tx.timestamp)}
            </span>
            <span
              className={cn(
                "ml-auto mono-data",
                failed && "text-muted-foreground line-through",
                !failed && tx.value > 0 && (out ? "text-outflow" : "text-inflow"),
              )}
            >
              {tx.value > 0 && (out ? "−" : "+")}
              {formatAmount(tx.value)}{" "}
              <span className="text-muted-foreground">{tx.asset.symbol}</span>
            </span>
            <a
              href={explorer.tx(tx.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="View on explorer"
            >
              <ExternalLink className="size-3" />
            </a>
          </li>
        );
      })}
      {txs.length > LIST_LIMIT && (
        <li className="px-3 py-2 text-center text-[11px] text-muted-foreground">
          + {formatCount(txs.length - LIST_LIMIT)} more
        </li>
      )}
    </ul>
  );
}
