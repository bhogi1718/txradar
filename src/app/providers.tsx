"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { z } from "zod";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Zod probes for eval support (to JIT-compile parsers) the first time it
// parses; under our CSP that probe is a logged violation. The browser only
// parses small API envelopes, so the interpreter is plenty.
if (typeof window !== "undefined") z.config({ jitless: true });

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // On-chain history is immutable; the only thing that changes is new
        // transactions appearing. 60s is a good balance for a tracker.
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  // useState (not useMemo) so the client survives React strict-mode remounts
  // and is never shared between requests during SSR.
  const [queryClient] = useState(makeQueryClient);

  return (
    // Dark is the designed default; "system" follows the OS once the user opts in.
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delay={200}>{children}</TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
