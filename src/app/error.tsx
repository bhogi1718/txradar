"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/** Last-resort boundary for render errors. Data errors are handled in-page. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="mono-data text-xs tracking-widest text-destructive uppercase">
        signal lost
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Something broke on this page
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The error has been logged to the console. Reloading usually fixes it.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCw className="size-4" /> Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          Home
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 mono-data text-[11px] text-muted-foreground/70">
          ref {error.digest}
        </p>
      )}
    </main>
  );
}
