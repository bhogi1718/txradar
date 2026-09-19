import Link from "next/link";

import { RadarMark } from "@/components/brand/radar-mark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RadarMark className="size-6 text-primary transition-transform duration-300 group-hover:rotate-12" />
          <span className="text-[15px] font-semibold tracking-tight">
            Tx<span className="text-primary">Radar</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
