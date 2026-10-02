"use client";

import { History, Info, Loader2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Segmented } from "@/components/common/segmented";
import { useFilterParams } from "@/hooks/use-filter-params";
import { usePriceHistory, useTokenPrices } from "@/hooks/use-price-history";
import { usePrices } from "@/hooks/use-prices";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useTransactions } from "@/hooks/use-transactions";
import {
  applyFilters,
  DEFAULT_FILTERS,
  filterByRange,
  rangeStart,
  type DirectionFilter,
  type RangePreset,
  type TxFilters,
} from "@/lib/analytics/filters";
import { summarizeCounterparties } from "@/lib/analytics/counterparties";
import { summarizeExposure } from "@/lib/analytics/entities";
import { summarize } from "@/lib/analytics/summary";
import { summarizeTokens, tokenContracts } from "@/lib/analytics/tokens";
import { summarizeUsd, type PricingContext } from "@/lib/analytics/valuation";
import { isValidAddress, normalizeAddress } from "@/lib/chains/address";
import { combinePages } from "@/lib/chains/pages";
import { csvFileName, downloadCsv, transactionsToCsv } from "@/lib/export/csv";
import { formatCount } from "@/lib/format";
import { CHAIN_META, type Chain } from "@/lib/schemas/chain";
import type { Transaction } from "@/lib/schemas/transaction";

import { CounterpartiesPanel } from "./counterparties-panel";
import { CounterpartyInspector } from "./counterparty-inspector";

import { EntitiesPanel } from "./entities-panel";
import { FlowChart } from "./flow-chart";
import { EmptyState, ErrorState, ScanningState } from "./states";
import { SummaryStrip } from "./summary-strip";
import { TokensPanel } from "./tokens-panel";
import { TransactionsTable } from "./transactions-table";
import { WalletHeader } from "./wallet-header";

function combinedLength(pages: { transactions: Transaction[] }[]): number {
  return combinePages(pages.map((p) => p.transactions)).length;
}

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

/**
 * Re-evaluate "now" once a minute so relative windows (24H, 7D…) roll
 * forward on a long-open tab without re-rendering every second.
 */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function WalletView({
  chain,
  address,
  initialFilters,
}: {
  chain: Chain;
  address: string;
  initialFilters: TxFilters;
}) {
  const meta = CHAIN_META[chain];
  const query = useTransactions(chain, address);
  const prices = usePrices();
  const [filters, setFilters] = useFilterParams(initialFilters);
  const { add: addRecent } = useRecentSearches();
  const now = useMinuteClock();
  const [searchDraft, setSearchDraft] = useState(filters.q);

  const all = query.transactions;
  const history = usePriceHistory(chain);
  const contracts = useMemo(() => tokenContracts(all), [all]);
  const tokenPrices = useTokenPrices(chain, contracts);

  const current = prices.data?.prices[chain]?.usd;
  const pricing = useMemo<PricingContext>(
    () => ({
      history: history.data?.prices,
      current,
      tokens: tokenPrices.data?.pricing,
    }),
    [history.data, current, tokenPrices.data],
  );

  useEffect(() => {
    if (query.isSuccess) addRecent(chain, address);
  }, [query.isSuccess, chain, address, addRecent]);

  // Debounce search → URL so typing doesn't thrash history/renders.
  useEffect(() => {
    if (searchDraft === filters.q) return;
    const t = setTimeout(() => setFilters({ q: searchDraft }), 250);
    return () => clearTimeout(t);
  }, [searchDraft, filters.q, setFilters]);

  const inWindow = useMemo(
    () => filterByRange(all, filters.range, now),
    [all, filters.range, now],
  );
  const summary = useMemo(() => summarize(inWindow), [inWindow]);
  const usdSummary = useMemo(
    () =>
      pricing.history || pricing.current !== undefined
        ? summarizeUsd(inWindow, pricing)
        : null,
    [inWindow, pricing],
  );
  const exposure = useMemo(() => summarizeExposure(inWindow), [inWindow]);
  const counterparties = useMemo(() => summarizeCounterparties(inWindow), [inWindow]);

  // Drop anything in a shared link that isn't an address on this chain.
  const trail = useMemo(
    () =>
      filters.trail
        .filter((a) => isValidAddress(chain, a))
        .map((a) => normalizeAddress(chain, a)),
    [filters.trail, chain],
  );
  const openCounterparty = useCallback(
    (addr: string) => setFilters({ trail: [addr] }),
    [setFilters],
  );
  const setTrail = useCallback((t: string[]) => setFilters({ trail: t }), [setFilters]);
  const exportRows = useCallback(
    (rowsToExport: Transaction[]) => {
      downloadCsv(
        transactionsToCsv(rowsToExport, { pricing }),
        csvFileName(chain, address, filters.range),
      );
      toast.success(
        `Exported ${formatCount(rowsToExport.length)} transaction${rowsToExport.length === 1 ? "" : "s"}`,
      );
    },
    [pricing, chain, address, filters.range],
  );
  const tokens = useMemo(
    () => summarizeTokens(inWindow, pricing.tokens),
    [inWindow, pricing.tokens],
  );
  const rows = useMemo(() => applyFilters(all, filters, now), [all, filters, now]);
  const chartRange = useMemo(() => {
    const from = rangeStart(filters.range, now);
    return from === null ? undefined : { from, to: now };
  }, [filters.range, now]);

  const dirCounts = useMemo(() => {
    const c = { all: 0, in: 0, out: 0, self: 0 };
    for (const tx of inWindow) {
      c.all += 1;
      c[tx.direction] += 1;
    }
    return c;
  }, [inWindow]);

  async function loadOlder() {
    const before = all.length;
    const res = await query.fetchNextPage();
    if (res.isError) {
      toast.error("Couldn't load older transactions", {
        description: res.error?.message,
      });
    } else if (res.data) {
      const added = combinedLength(res.data.pages) - before;
      if (added > 0) toast.success(`Loaded ${formatCount(added)} older transactions`);
    }
  }

  const loadOlderButton = (
    <button
      type="button"
      onClick={() => void loadOlder()}
      disabled={query.isFetchingNextPage}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      {query.isFetchingNextPage ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <History className="size-3.5" />
      )}
      {query.isFetchingNextPage ? "Loading…" : "Load older"}
    </button>
  );

  function focusSearch(term: string) {
    setSearchDraft(term);
    setFilters({ q: term, dir: "all", trail: [] });
    document
      .getElementById("transactions")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filtersActive =
    filters.dir !== "all" ||
    filters.q !== "" ||
    filters.hideFailed ||
    filters.range !== "all";

  const header = (
    <WalletHeader
      chain={chain}
      address={address}
      fetchedAt={query.fetchedAt}
      cached={query.cached}
      onRefresh={query.data ? () => void query.refetch() : undefined}
      refreshing={query.isFetching && !query.isPending}
    />
  );

  if (query.isPending) {
    return (
      <div className="space-y-8">
        {header}
        <ScanningState chain={chain} />
      </div>
    );
  }

  // Only a failed *first* page replaces the view; a failed older page keeps
  // what's loaded and reports inline (see loadOlder).
  if (query.isError && !query.data) {
    return (
      <div className="space-y-8">
        {header}
        <ErrorState
          key={query.errorUpdatedAt}
          error={query.error}
          chain={chain}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        <div className="rounded-xl border border-border/70 bg-card/70">
          <EmptyState
            title="No transactions on record"
            body={`This ${meta.name} address is valid, but the explorer has no transactions for it yet.`}
          />
        </div>
      </div>
    );
  }

  const toolbar = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<DirectionFilter>
          aria-label="Direction"
          size="sm"
          value={filters.dir}
          onChange={(dir) => setFilters({ dir })}
          options={[
            { value: "all", label: "All", count: dirCounts.all },
            { value: "in", label: "In", count: dirCounts.in },
            { value: "out", label: "Out", count: dirCounts.out },
            {
              value: "self",
              label: "Self",
              count: dirCounts.self,
              disabled: dirCounts.self === 0,
            },
          ]}
        />
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground select-none hover:text-foreground">
          <input
            type="checkbox"
            checked={filters.hideFailed}
            onChange={(e) => setFilters({ hideFailed: e.target.checked })}
            className="size-3.5 accent-[var(--primary)]"
          />
          Hide failed
        </label>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search hash, address or method"
            aria-label="Search transactions"
            spellCheck={false}
            className="h-8 w-full rounded-lg border border-border bg-surface pr-8 pl-8 mono-data text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
          />
          {searchDraft && (
            <button
              type="button"
              onClick={() => {
                setSearchDraft("");
                setFilters({ q: "" });
              }}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<RangePreset>
          aria-label="Time window"
          value={filters.range}
          onChange={(range) => setFilters({ range })}
          options={RANGE_OPTIONS}
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5" />
          {query.hasNextPage ? (
            <>
              Latest {formatCount(all.length)} transactions
              {loadOlderButton}
            </>
          ) : (
            <>Full history · {formatCount(all.length)} transactions</>
          )}
        </div>
      </div>

      <SummaryStrip summary={summary} symbol={meta.symbol} usd={usdSummary} />

      <FlowChart txs={inWindow} symbol={meta.symbol} range={chartRange} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CounterpartiesPanel
          counterparties={counterparties}
          symbol={meta.symbol}
          onOpen={openCounterparty}
        />
        <div className="grid gap-6">
          <EntitiesPanel
            exposure={exposure}
            symbol={meta.symbol}
            onSelect={focusSearch}
          />
          {tokens.length > 0 && <TokensPanel tokens={tokens} onSelect={focusSearch} />}
        </div>
      </div>

      <TransactionsTable
        data={rows}
        chain={chain}
        pricing={pricing}
        onOpenCounterparty={openCounterparty}
        onExport={exportRows}
        footerExtra={query.hasNextPage ? loadOlderButton : null}
        toolbar={toolbar}
        empty={
          <EmptyState
            title="Nothing matches these filters"
            body={
              inWindow.length === 0
                ? "No activity in this time window. Try a wider range."
                : "Try a different direction or clear the search."
            }
            action={
              filtersActive && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft("");
                    setFilters(DEFAULT_FILTERS);
                  }}
                  className="inline-flex h-8 items-center rounded-lg bg-secondary px-3 text-xs font-medium outline-none hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Clear all filters
                </button>
              )
            }
          />
        }
      />

      <CounterpartyInspector
        chain={chain}
        root={address}
        trail={trail}
        onTrailChange={setTrail}
        onShowInTable={focusSearch}
      />
    </div>
  );
}
