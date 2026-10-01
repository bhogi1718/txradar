import { cn } from "@/lib/utils";

type Blip = { top: string; left: string; delay: string; tone?: "in" | "out" | "primary" };

const DEFAULT_BLIPS: Blip[] = [
  { top: "28%", left: "64%", delay: "0s", tone: "in" },
  { top: "62%", left: "72%", delay: "0.6s", tone: "out" },
  { top: "70%", left: "34%", delay: "1.2s", tone: "in" },
  { top: "36%", left: "26%", delay: "1.8s", tone: "primary" },
];

const BLIP_TONE = {
  in: "bg-inflow shadow-[0_0_10px_var(--inflow)]",
  out: "bg-outflow shadow-[0_0_10px_var(--outflow)]",
  primary: "bg-primary shadow-[0_0_10px_var(--primary)]",
} as const;

/**
 * Animated radar scope: rings, crosshair, a rotating phosphor sweep and a
 * few blips. Pure CSS; respects prefers-reduced-motion via globals.css.
 */
export function RadarScope({
  className,
  blips = DEFAULT_BLIPS,
}: {
  className?: string;
  blips?: Blip[];
}) {
  return (
    <div aria-hidden className={cn("relative aspect-square", className)}>
      {/* rings */}
      <div className="absolute inset-0 rounded-full border border-primary/25 bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_70%)]" />
      <div className="absolute inset-[16%] rounded-full border border-primary/15" />
      <div className="absolute inset-[32%] rounded-full border border-primary/15" />
      <div className="absolute inset-[46%] rounded-full bg-primary/40" />

      {/* crosshair */}
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-primary/10" />
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-primary/10" />

      {/* sweep */}
      <div
        className="absolute inset-0 animate-radar-sweep rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, transparent 290deg, color-mix(in oklch, var(--primary) 8%, transparent) 320deg, color-mix(in oklch, var(--primary) 38%, transparent) 360deg)",
        }}
      />

      {/* blips */}
      {blips.map((b, i) => (
        <span
          key={i}
          className={cn(
            "absolute size-1.5 -translate-1/2 animate-blip rounded-full",
            BLIP_TONE[b.tone ?? "primary"],
          )}
          style={{ top: b.top, left: b.left, animationDelay: b.delay }}
        />
      ))}
    </div>
  );
}
