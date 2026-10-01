import { truncateAddress } from "@/lib/chains/address";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

/**
 * Monospaced, truncated address with the full value in a native tooltip and
 * an optional copy affordance that appears on hover/focus.
 */
export function Address({
  value,
  head = 6,
  tail = 4,
  copy = true,
  className,
}: {
  value: string | null;
  head?: number;
  tail?: number;
  copy?: boolean;
  className?: string;
}) {
  if (!value) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className={cn("group/address inline-flex items-center gap-1", className)}>
      <span className="mono-data text-[13px]" title={value}>
        {truncateAddress(value, head, tail)}
      </span>
      {copy && (
        <CopyButton
          value={value}
          label="Copy address"
          className="size-5 opacity-0 transition-opacity group-hover/address:opacity-100 focus-visible:opacity-100"
        />
      )}
    </span>
  );
}
