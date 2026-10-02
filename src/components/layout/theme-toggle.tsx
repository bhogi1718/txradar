"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** True only on the client, after hydration — without a setState-in-effect. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  // The server can't know the theme; render a stable placeholder until hydrated.
  const dark = !hydrated || resolvedTheme !== "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
