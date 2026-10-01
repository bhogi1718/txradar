import { Building2, Coins, Landmark } from "lucide-react";

import type { AddressLabel, LabelKind } from "@/lib/labels";
import { cn } from "@/lib/utils";

const KIND: Record<
  LabelKind,
  { icon: typeof Building2; label: string; className: string }
> = {
  exchange: {
    icon: Building2,
    label: "Exchange",
    className: "bg-chain-btc/10 text-chain-btc ring-chain-btc/25",
  },
  token: {
    icon: Coins,
    label: "Token contract",
    className: "bg-chain-eth/10 text-chain-eth ring-chain-eth/25",
  },
  protocol: {
    icon: Landmark,
    label: "Protocol",
    className: "bg-primary/10 text-primary ring-primary/25",
  },
};

export function entityKindLabel(kind: LabelKind): string {
  return KIND[kind].label;
}

/** Compact chip for a known address. Hover shows what kind of entity it is and the source. */
export function EntityTag({
  label,
  showKind = false,
  className,
}: {
  label: AddressLabel;
  showKind?: boolean;
  className?: string;
}) {
  const k = KIND[label.kind];
  const Icon = k.icon;
  return (
    <span
      title={`${k.label} · verified via ${new URL(label.source).hostname}`}
      className={cn(
        "inline-flex h-5 max-w-44 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ring-1",
        k.className,
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{label.name}</span>
      {showKind && <span className="opacity-70">· {k.label}</span>}
    </span>
  );
}
