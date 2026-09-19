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
    },
    projects: [
      {
        // Pure logic: adapters, schemas, utils. Runs in Node (fast, has node:crypto).
        extends: true,
        test: {
          name: "lib",
          environment: "node",
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
