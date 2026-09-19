import { ok } from "@/lib/api/response";
import { env } from "@/lib/env";

/** Liveness + which providers are configured. Never echoes secret values. */
export function GET() {
  const e = env();
  return ok({
    status: "ok",
    time: new Date().toISOString(),
    providers: {
      etherscan: Boolean(e.ETHERSCAN_API_KEY),
      trongrid: Boolean(e.TRONGRID_API_KEY),
      coingecko: Boolean(e.COINGECKO_API_KEY),
      esplora: e.ESPLORA_BASE_URL ?? "default",
    },
  });
}
