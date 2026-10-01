"use client";

import { CircleAlert, Clock, RotateCw, SearchX, WifiOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { RadarScope } from "@/components/common/radar-scope";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError } from "@/lib/api/client";
import { CHAIN_META, type Chain } from "@/lib/schemas/chain";
import { cn } from "@/lib/utils";

/** Full-page loading state: a working radar, not a spinner. */
export function ScanningState({ chain }: { chain: Chain }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <div className="flex flex-col items-center justify-center gap-5 py-10">
        <RadarScope className="w-36" />
        <div className="text-center">
          <p className="text-sm font-medium">
            Scanning the {CHAIN_META[chain].name} ledger…
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pulling recent history from the explorer. Busy wallets can take a few seconds.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton
            key={i}
            className="h-11 rounded-lg"
            style={{ opacity: 1 - i * 0.13 }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Seconds remaining until a deadline fixed at mount. Callers remount (via
 * `key`) when a new error arrives, which restarts the countdown.
 */
function useCountdown(seconds: number | undefined) {
  const [deadline] = useState(() => Date.now() + (seconds ?? 0) * 1000);
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [left]);
  return left;
}

function describe(error: Error, chain: Chain) {
  const name = CHAIN_META[chain].name;
  if (!(error instanceof ApiClientError)) {
    return { icon: CircleAlert, title: "Something went wrong", body: error.message };
  }
  switch (error.code) {
    case "RATE_LIMITED":
      return {
        icon: Clock,
        title: "The explorer asked us to slow down",
        body: `The ${name} data provider rate-limited this request. This clears on its own.`,
      };
    case "TIMEOUT":
      return {
        icon: Clock,
        title: "The explorer took too long",
        body: `${error.provider ?? "The provider"} didn't answer in time. It's usually a temporary slowdown.`,
      };
    case "NETWORK":
      return {
        icon: WifiOff,
        title: "Couldn't reach the data provider",
        body: "Check your internet connection, then try again.",
      };
    case "SCHEMA_MISMATCH":
      return {
        icon: CircleAlert,
        title: "The explorer returned something unexpected",
        body: "Its response format may have changed. The details below will help if you report it.",
      };
    case "INVALID_REQUEST":
      return {
        icon: SearchX,
        title: "That address can't be scanned",
        body: error.message,
      };
    default:
      return {
        icon: CircleAlert,
        title: `Couldn't load ${name} history`,
        body: error.message,
      };
  }
}

export function ErrorState({
  error,
  chain,
  onRetry,
  retrying,
}: {
  error: Error;
  chain: Chain;
  onRetry: () => void;
  retrying: boolean;
}) {
  const retryAfter = error instanceof ApiClientError ? error.retryAfter : undefined;
  const left = useCountdown(retryAfter);
  const { icon: Icon, title, body } = describe(error, chain);
  const detail =
    error instanceof ApiClientError
      ? `${error.code}${error.provider ? ` · ${error.provider}` : ""}${error.status ? ` · HTTP ${error.status}` : ""}`
      : error.name;

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center"
    >
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying || left > 0}
        className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-secondary px-4 text-sm font-medium outline-none hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <RotateCw className={cn("size-4", retrying && "animate-spin")} />
        {left > 0 ? `Retry in ${left}s` : retrying ? "Retrying…" : "Try again"}
      </button>
      <p className="mt-4 mono-data text-[11px] text-muted-foreground/70">{detail}</p>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <RadarScope className="w-20 opacity-60" blips={[]} />
      <h3 className="mt-5 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
