import { CHAIN_META, type Chain } from "@/lib/schemas/chain";
import { cn } from "@/lib/utils";

const TONE: Record<Chain, string> = {
  bitcoin: "text-chain-btc bg-chain-btc/10 ring-chain-btc/25",
  ethereum: "text-chain-eth bg-chain-eth/10 ring-chain-eth/25",
  tron: "text-chain-trx bg-chain-trx/10 ring-chain-trx/25",
};

const GLYPH: Record<Chain, string> = {
  bitcoin: "₿",
  ethereum: "Ξ",
  tron: "◈",
};

export function chainTone(chain: Chain): string {
  return TONE[chain];
}

/** Round glyph in the chain's color. Decorative; pair with a text label. */
export function ChainGlyph({ chain, className }: { chain: Chain; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] leading-none font-semibold ring-1",
        TONE[chain],
        className,
      )}
    >
      {GLYPH[chain]}
    </span>
  );
}

export function ChainBadge({
  chain,
  showSymbol = false,
  className,
}: {
  chain: Chain;
  showSymbol?: boolean;
  className?: string;
}) {
  const meta = CHAIN_META[chain];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full pr-2.5 pl-0.5 text-xs font-medium ring-1",
        TONE[chain],
        className,
      )}
    >
      <ChainGlyph chain={chain} className="size-5 text-[11px] ring-0" />
      {meta.name}
      {showSymbol && <span className="mono-data opacity-70">{meta.symbol}</span>}
    </span>
  );
}
