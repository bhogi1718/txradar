import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/lib/**", "src/hooks/**", "src/components/**"],
      exclude: ["src/components/ui/**", "src/**/*.d.ts", "src/**/__fixtures__/**"],
      // Floors just under the current numbers: CI fails if a change lands
      // untested code. Page-level wiring (wallet-view, layout) is covered by
      // the Playwright suite instead, which v8 coverage doesn't see.
      thresholds: {
        statements: 78,
        branches: 73,
        functions: 68,
        lines: 78,
      },
    },
    projects: [
      {
        // Pure logic: adapters, schemas, utils. Runs in Node (fast, has node:crypto).
        extends: true,
        test: {
          name: "lib",
          environment: "node",
          setupFiles: ["./src/test/setup-lib.ts"],
          include: ["src/lib/**/*.{test,spec}.ts", "src/app/api/**/*.{test,spec}.ts"],
        },
      },
      {
        // React components and hooks.
        extends: true,
        test: {
          name: "ui",
          environment: "happy-dom",
          setupFiles: ["./src/test/setup.ts"],
          include: [
            "src/components/**/*.{test,spec}.tsx",
            "src/hooks/**/*.{test,spec}.{ts,tsx}",
          ],
        },
      },
    ],
  },
});
