"use client";

import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDownLeft,
  ArrowDownUp,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  TriangleAlert,
  Clock,
  ExternalLink,
  Repeat,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { Address } from "@/components/common/address";
import { EntityTag } from "@/components/common/entity-tag";
import { Segmented } from "@/components/common/segmented";
import { counterpartyOf } from "@/lib/analytics/summary";
import { valueTx, type PricingContext } from "@/lib/analytics/valuation";
import { truncateAddress } from "@/lib/chains/address";
import {
  formatAmount,
  formatCount,
  formatDate,
  formatDateTime,
  formatRelative,
  formatUsd,
} from "@/lib/format";
import { getLabel } from "@/lib/labels";
import { CHAIN_META, type Chain } from "@/lib/schemas/chain";
import {
  isNative,
  type Direction,
  type Transaction,
  type TxCategory,
} from "@/lib/schemas/transaction";
import { cn } from "@/lib/utils";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const helper = createColumnHelper<typeof features, Transaction>();

const PAGE_SIZES = ["25", "50", "100"] as const;

const ALIGN: Record<string, string> = {
  amount: "text-right",
  usd: "text-right",
  fee: "text-right",
  link: "text-right",
};

const HIDE_ON_SMALL: Record<string, string> = {
  type: "hidden md:table-cell",
  usd: "hidden lg:table-cell",
  fee: "hidden xl:table-cell",
};

const DIRECTION_STYLE: Record<
  Direction,
  { label: string; icon: ReactNode; className: string }
> = {
  in: {
    label: "In",
    icon: <ArrowDownLeft className="size-3" />,
    className: "bg-inflow/10 text-inflow ring-inflow/20",
  },
  out: {
    label: "Out",
    icon: <ArrowUpRight className="size-3" />,
    className: "bg-outflow/10 text-outflow ring-outflow/20",
  },
  self: {
    label: "Self",
    icon: <Repeat className="size-3" />,
    className: "bg-muted text-muted-foreground ring-border",
  },
};

const CATEGORY_LABEL: Record<TxCategory, string> = {
  transfer: "Transfer",
  "contract-call": "Contract call",
  "contract-creation": "Deploy contract",
  "token-transfer": "Token transfer",
};

function signed(tx: Transaction): number {
  if (tx.status === "failed") return 0;
  return tx.direction === "out" ? -tx.value : tx.direction === "in" ? tx.value : 0;
}

function DirectionPill({ direction }: { direction: Direction }) {
  const s = DIRECTION_STYLE[direction];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold tracking-wide uppercase ring-1",
        s.className,
      )}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

function StatusMark({ status }: { status: Transaction["status"] }) {
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
        <CircleAlert className="size-3" /> Failed
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-chain-btc">
        <Clock className="size-3 animate-blip" /> Pending
      </span>
    );
  }
  return null;
}

function buildColumns(chain: Chain, pricing: PricingContext) {
  const { symbol, explorer } = CHAIN_META[chain];

  return helper.columns([
    helper.accessor("timestamp", {
      id: "time",
      header: "Time",
      sortDescFirst: true,
      cell: (info) => {
        const tx = info.row.original;
        return (
          <div className="flex flex-col">
            <span className="text-[13px]" title={formatDateTime(tx.timestamp)}>
              {formatRelative(tx.timestamp)}
            </span>
            <StatusMark status={tx.status} />
          </div>
        );
      },
    }),
    helper.accessor("direction", {
      id: "direction",
      header: "Flow",
      enableSorting: false,
      cell: (info) => <DirectionPill direction={info.getValue()} />,
    }),
    helper.accessor((tx) => counterpartyOf(tx), {
      id: "counterparty",
      header: "Counterparty",
      enableSorting: false,
      cell: (info) => {
        const tx = info.row.original;
        if (tx.direction === "self") {
          return <span className="text-xs text-muted-foreground">Own wallet</span>;
        }
        const label = getLabel(tx.chain, info.getValue());
        return (
          <div className="flex items-center gap-1.5">
            {label && <EntityTag label={label} />}
            <Address value={info.getValue()} head={label ? 4 : 6} />
          </div>
        );
      },
    }),
    helper.accessor("category", {
      id: "type",
      header: "Type",
      enableSorting: false,
      cell: (info) => {
        const tx = info.row.original;
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-muted-foreground">
              {CATEGORY_LABEL[tx.category]}
            </span>
            {tx.method &&
              tx.method !== "TriggerSmartContract" &&
              tx.category !== "token-transfer" && (
                <span className="max-w-32 truncate rounded bg-muted px-1.5 py-0.5 mono-data text-[11px]">
                  {tx.method}
                </span>
              )}
          </div>
        );
      },
    }),
    helper.accessor((tx) => signed(tx), {
      id: "amount",
      header: "Amount",
      sortDescFirst: true,
      cell: (info) => {
        const tx = info.row.original;
        const v = info.getValue();
        const failed = tx.status === "failed";
        const token = !isNative(tx);
        const unverified =
          token &&
          pricing.tokens !== undefined &&
          pricing.tokens[tx.asset.contract!] === undefined;
        return (
          <span className="inline-flex items-baseline gap-1.5">
            <span
              className={cn(
                "mono-data text-[13px] font-medium",
                failed && "text-muted-foreground line-through",
                !failed && v > 0 && "text-inflow",
                !failed && v < 0 && "text-outflow",
              )}
            >
              {tx.direction === "self"
                ? formatAmount(tx.value)
                : formatAmount(failed ? tx.value : v, { signed: true })}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px]",
                token && !unverified
                  ? "font-medium text-foreground/80"
                  : "text-muted-foreground",
              )}
              title={
                unverified
                  ? `${tx.asset.contract} — no market price; possibly a spam token`
                  : (tx.asset.contract ?? undefined)
              }
            >
              {unverified && <TriangleAlert className="size-3 text-destructive" />}
              {tx.asset.symbol}
            </span>
          </span>
        );
      },
    }),
    helper.display({
      id: "usd",
      header: "Value (USD)",
      cell: (info) => {
        const tx = info.row.original;
        const v = Math.abs(signed(tx)) > 0 ? valueTx(tx, pricing) : null;
        if (!v) return <span className="text-muted-foreground/60">—</span>;
        return (
          <span
            className="mono-data text-[13px] text-muted-foreground"
            title={
              v.basis === "historical"
                ? `At the ${formatDate(tx.timestamp)} price`
                : "At today's price"
            }
          >
            {formatUsd(v.usd)}
            {v.basis === "current" && (
              <span className="ml-0.5 text-[10px] opacity-60">*</span>
            )}
          </span>
        );
      },
    }),
    helper.accessor("fee", {
      id: "fee",
      header: `Fee (${symbol})`,
      enableSorting: false,
      cell: (info) => {
        const fee = info.getValue();
        return fee === null ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          <span className="mono-data text-[13px] text-muted-foreground">
            {formatAmount(fee)}
          </span>
        );
      },
    }),
    helper.display({
      id: "link",
      header: "Tx",
      cell: (info) => {
        const tx = info.row.original;
        return (
          <a
            href={explorer.tx(tx.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded mono-data text-[12px] text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            title={tx.hash}
          >
            {truncateAddress(tx.hash, 4, 4)}
            <ExternalLink className="size-3" />
          </a>
        );
      },
    }),
  ]);
}

export function TransactionsTable({
  data,
  chain,
  pricing,
  toolbar,
  empty,
}: {
  data: Transaction[];
  chain: Chain;
  pricing: PricingContext;
  toolbar?: ReactNode;
  /** Rendered in place of rows when `data` is empty. */
  empty?: ReactNode;
}) {
  const columns = useMemo(() => buildColumns(chain, pricing), [chain, pricing]);

  const table = useTable({
    features,
    columns,
    data,
    // One tx can carry several token transfers, so the hash alone isn't unique.
    getRowId: (row, index) => `${row.hash}:${row.asset.contract ?? "native"}:${index}`,
    autoResetPageIndex: true,
    enableSortingRemoval: false,
    initialState: {
      sorting: [{ id: "time", desc: true }],
      pagination: { pageIndex: 0, pageSize: 25 },
    },
  });

  const { pageIndex, pageSize } = table.state.pagination;
  const total = table.getRowCount();
  const firstRow = total === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <section
      id="transactions"
      className="scroll-mt-20 overflow-hidden rounded-xl border border-border/70 bg-card/70 backdrop-blur"
    >
      {toolbar && <div className="border-b border-border/70 p-3 sm:p-4">{toolbar}</div>}

      {data.length === 0 ? (
        empty
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id} className="border-b border-border/70">
                    {group.headers.map((header) => {
                      const id = header.column.id;
                      const sortable = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={
                            sorted === "asc"
                              ? "ascending"
                              : sorted === "desc"
                                ? "descending"
                                : undefined
                          }
                          className={cn(
                            "h-10 px-3 text-left text-[11px] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase first:pl-4 last:pr-4",
                            ALIGN[id],
                            HIDE_ON_SMALL[id],
                          )}
                        >
                          {header.isPlaceholder ? null : sortable ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cn(
                                "inline-flex items-center gap-1 rounded uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                                sorted && "text-foreground",
                              )}
                            >
                              <table.FlexRender header={header} />
                              {sorted === "asc" ? (
                                <ChevronUp className="size-3" />
                              ) : sorted === "desc" ? (
                                <ChevronDown className="size-3" />
                              ) : (
                                <ArrowDownUp className="size-3 opacity-40" />
                              )}
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/40 transition-colors last:border-0 hover:bg-muted/40",
                      row.original.status === "failed" && "opacity-70",
                    )}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "h-12 px-3 align-middle whitespace-nowrap first:pl-4 last:pr-4",
                          ALIGN[cell.column.id],
                          HIDE_ON_SMALL[cell.column.id],
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="mono-data text-foreground">{formatCount(firstRow)}</span>–
              <span className="mono-data text-foreground">{formatCount(lastRow)}</span> of{" "}
              <span className="mono-data text-foreground">{formatCount(total)}</span>
            </p>
            <div className="flex items-center gap-3">
              <Segmented
                aria-label="Rows per page"
                size="sm"
                value={String(pageSize) as (typeof PAGE_SIZES)[number]}
                onChange={(v) => table.setPageSize(Number(v))}
                options={PAGE_SIZES.map((s) => ({ value: s, label: s }))}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Previous page"
                  className="inline-flex size-7 items-center justify-center rounded-md border border-border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="min-w-14 text-center mono-data text-xs text-muted-foreground">
                  {pageIndex + 1} / {Math.max(1, table.getPageCount())}
                </span>
                <button
                  type="button"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Next page"
                  className="inline-flex size-7 items-center justify-center rounded-md border border-border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
