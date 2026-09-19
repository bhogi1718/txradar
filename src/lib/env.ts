import { z } from "zod";

/**
 * Server-side environment, validated once. Import only from server code
 * (route handlers, server components); never from a "use client" module.
 */
const envSchema = z.object({
  ETHERSCAN_API_KEY: z.string().trim().min(1).optional(),
  TRONGRID_API_KEY: z.string().trim().min(1).optional(),
  COINGECKO_API_KEY: z.string().trim().min(1).optional(),
  ESPLORA_BASE_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse({
    ETHERSCAN_API_KEY: emptyToUndefined(source.ETHERSCAN_API_KEY),
    TRONGRID_API_KEY: emptyToUndefined(source.TRONGRID_API_KEY),
    COINGECKO_API_KEY: emptyToUndefined(source.COINGECKO_API_KEY),
    ESPLORA_BASE_URL: emptyToUndefined(source.ESPLORA_BASE_URL),
  });
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= readEnv();
  return cached;
}
