"use client";

import { ArrowLeft, ExternalLink, RotateCw } from "lucide-react";
import Link from "next/link";

import { ChainBadge } from "@/components/common/chain-badge";
import { CopyButton } from "@/components/common/copy-button";
import { EntityTag } from "@/components/common/entity-tag";
import { getLabel } from "@/lib/labels";
import { formatRelative } from "@/lib/format";
import { CHAIN_META, type Chain } from "@/lib/schemas/chain";
import { cn } from "@/lib/utils";

export function WalletHeader({
  chain,
  address,
  fetchedAt,
  cached,
  onRefresh,
  refreshing,
}: {
  chain: Chain;
  address: string;
  fetchedAt?: string;
  cached?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const meta = CHAIN_META[chain];
  const label = getLabel(chain, address);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-3.5" /> New scan
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <ChainBadge chain={chain} showSymbol />
          {label ? (
            <EntityTag label={label} showKind />
          ) : (
            <span className="text-xs text-muted-foreground">Wallet</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <h1 className="min-w-0 mono-data text-lg font-medium break-all sm:text-xl">
            {address}
          </h1>
          <CopyButton value={address} label="Copy address" className="size-7" />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {fetchedAt && (
          <span className="mr-1 text-xs text-muted-foreground" title={fetchedAt}>
            Updated {formatRelative(Date.parse(fetchedAt))}
            {cached && <span className="ml-1 text-muted-foreground/60">· cached</span>}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <RotateCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
        )}
        <a
          href={meta.explorer.address(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          Explorer <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
