import Link from "next/link";

import { RadarMark } from "@/components/brand/radar-mark";
import { WalletSearch } from "@/components/search/wallet-search";
import { cn } from "@/lib/utils";

export function SiteHeader({ showSearch = false }: { showSearch?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RadarMark className="size-6 text-primary transition-transform duration-300 group-hover:rotate-12" />
          <span
            className={cn(
              "text-[15px] font-semibold tracking-tight",
              showSearch && "hidden sm:inline",
            )}
          >
            Tx<span className="text-primary">Radar</span>
          </span>
        </Link>

        {showSearch && (
          <div className="relative mx-auto min-w-0 flex-1 sm:max-w-md">
            <WalletSearch variant="compact" />
          </div>
        )}

        <div className="ml-auto hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-radar-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="mono-data tracking-wider uppercase">local</span>
        </div>
      </div>
    </header>
  );
}
