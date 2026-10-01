"use client";

import { ArrowRight, CircleAlert, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { ChainBadge } from "@/components/common/chain-badge";
import { normalizeAddress } from "@/lib/chains/address";
import { detectChain, guessChainFromPrefix } from "@/lib/chains/detect";
import { CHAIN_META } from "@/lib/schemas/chain";
import { cn } from "@/lib/utils";

type WalletSearchProps = {
  variant?: "hero" | "compact";
  defaultValue?: string;
  autoFocus?: boolean;
  className?: string;
};

/**
 * Address input with live chain detection. There is no chain picker: BTC,
 * ETH and TRX address formats don't overlap, so the address alone decides.
 * Press "/" anywhere to focus.
 */
export function WalletSearch({
  variant = "hero",
  defaultValue = "",
  autoFocus = false,
  className,
}: WalletSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmed = value.trim();
  const detected = detectChain(trimmed);
  const guess = detected ? null : guessChainFromPrefix(trimmed);
  const hero = variant === "hero";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed) {
      setError("Paste a wallet address to scan.");
      inputRef.current?.focus();
      return;
    }
    if (!detected) {
      setError(
        guess
          ? `That looks like a ${CHAIN_META[guess].name} address, but it isn't complete or valid.`
          : "Not a Bitcoin, Ethereum or Tron address. Check for missing or extra characters.",
      );
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    router.push(`/${detected}/${normalizeAddress(detected, trimmed)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn("w-full", className)}
      noValidate
      role="search"
    >
      <div
        className={cn(
          "group relative flex items-center rounded-xl border bg-card/80 backdrop-blur transition-[border-color,box-shadow]",
          "focus-within:border-primary/60 focus-within:ring-glow",
          error ? "border-destructive/60" : "border-border",
          hero ? "h-14 pr-1.5 pl-4" : "h-9 pr-1 pl-3",
        )}
      >
        <Search
          aria-hidden
          className={cn("shrink-0 text-muted-foreground", hero ? "size-5" : "size-4")}
        />
        <label htmlFor={`${errorId}-input`} className="sr-only">
          Wallet address
        </label>
        <input
          id={`${errorId}-input`}
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder={hero ? "Paste a BTC, ETH or TRX address" : "Scan another wallet…"}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent mono-data outline-none placeholder:font-sans placeholder:text-muted-foreground/70",
            hero ? "px-3 text-[15px]" : "px-2 text-[13px]",
          )}
        />

        {/* live detection */}
        <div className="flex shrink-0 items-center gap-1.5">
          {detected ? (
            <ChainBadge
              chain={detected}
              className={cn(
                "animate-in duration-200 zoom-in-95 fade-in",
                !hero && "hidden sm:inline-flex",
              )}
            />
          ) : guess && trimmed.length > 1 && hero ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Looks like {CHAIN_META[guess].name}…
            </span>
          ) : null}

          {hero ? (
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                detected
                  ? "bg-primary text-primary-foreground hover:brightness-110"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              Scan
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Scan wallet"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowRight className="size-4" />
            </button>
          )}
        </div>

        {!hero && !value && (
          <kbd className="pointer-events-none absolute top-1/2 right-10 hidden -translate-y-1/2 rounded border border-border px-1.5 mono-data text-[10px] text-muted-foreground md:block">
            /
          </kbd>
        )}
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className={cn(
            "flex items-start gap-1.5 text-destructive",
            hero
              ? "mt-2.5 text-sm"
              : "absolute mt-1.5 rounded-md bg-popover px-2 py-1 text-xs shadow-md ring-1 ring-border",
          )}
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </form>
  );
}
