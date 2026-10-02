"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Optional trailing count, rendered muted. */
  count?: number;
  disabled?: boolean;
};

type SegmentedProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  "aria-label": string;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Single-select segmented control (radiogroup semantics). Arrow keys move
 * between options, Home/End jump, and only the active option is in the tab
 * order — the WAI-ARIA radio pattern.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  ...aria
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  function focusAndSelect(index: number) {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    refs.current[index]?.focus();
    onChange(opt.value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const pos = enabled.indexOf(index);
    let next: number | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = enabled[(pos + 1) % enabled.length];
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = enabled[(pos - 1 + enabled.length) % enabled.length];
    } else if (e.key === "Home") {
      next = enabled[0];
    } else if (e.key === "End") {
      next = enabled[enabled.length - 1];
    }
    if (next === undefined) return;
    e.preventDefault();
    focusAndSelect(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-surface p-0.5",
        className,
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active
                ? "bg-surface-raised text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={cn(
                  "mono-data text-[11px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
