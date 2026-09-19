import { cn } from "@/lib/utils";

type RadarMarkProps = {
  className?: string;
  /** Animate the sweep. Off by default so static usages stay calm. */
  sweeping?: boolean;
  title?: string;
};

/**
 * TxRadar brand mark: concentric rings, crosshair, a sweep arm and one blip.
 * Pure SVG using currentColor so it inherits text color anywhere.
 */
export function RadarMark({
  className,
  sweeping = false,
  title = "TxRadar",
}: RadarMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-6 shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle
        cx="16"
        cy="16"
        r="14"
        stroke="currentColor"
        strokeOpacity="0.9"
        strokeWidth="1.5"
      />
      <circle
        cx="16"
        cy="16"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      <circle
        cx="16"
        cy="16"
        r="4"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      <path
        d="M16 2v28M2 16h28"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1"
      />
      <g
        className={cn(sweeping && "animate-radar-sweep")}
        style={{ transformOrigin: "16px 16px" }}
      >
        <path
          d="M16 16 L16 2 A14 14 0 0 1 28.12 9"
          fill="currentColor"
          fillOpacity="0.18"
        />
        <path
          d="M16 16 L16 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <circle
        cx="22"
        cy="11"
        r="1.8"
        fill="currentColor"
        className={cn(sweeping && "animate-blip")}
      />
    </svg>
  );
}
