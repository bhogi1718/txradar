import type { ZodType } from "zod";

import { UpstreamError } from "./errors";

export type FetchJsonOptions<T> = {
  provider: string;
  schema: ZodType<T>;
  headers?: Record<string, string>;
  /** Abort after this many ms. Explorers occasionally hang; never wait forever. */
  timeoutMs?: number;
  /**
   * Next.js data-cache hint. Ignored outside Next (tests, scripts), which is
   * exactly what we want: adapters stay framework-agnostic.
   */
  revalidate?: number | false;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * fetch + timeout + status mapping + schema validation in one place.
 * Anything that comes back from here is typed and trustworthy.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions<T>,
): Promise<T> {
  const {
    provider,
    schema,
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    revalidate,
  } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      ...(revalidate !== undefined && { next: { revalidate } }),
    });
  } catch (cause) {
    const isTimeout =
      cause instanceof DOMException
        ? cause.name === "TimeoutError" || cause.name === "AbortError"
        : cause instanceof Error && cause.name === "TimeoutError";
    if (isTimeout) {
      throw new UpstreamError(
        "TIMEOUT",
        `${provider} did not respond within ${timeoutMs}ms`,
        {
          provider,
          cause,
        },
      );
    }
    throw new UpstreamError("NETWORK", `Could not reach ${provider}`, {
      provider,
      cause,
    });
  }

  if (response.status === 429) {
    throw new UpstreamError("RATE_LIMITED", `${provider} rate limit reached`, {
      provider,
      status: 429,
      retryAfter: parseRetryAfter(response.headers.get("retry-after")) ?? 30,
    });
  }

  if (!response.ok) {
    throw new UpstreamError(
      "UPSTREAM_ERROR",
      `${provider} responded with HTTP ${response.status}`,
      {
        provider,
        status: response.status,
      },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new UpstreamError("SCHEMA_MISMATCH", `${provider} returned non-JSON body`, {
      provider,
      status: response.status,
      cause,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new UpstreamError(
      "SCHEMA_MISMATCH",
      `${provider} response did not match the expected shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
      { provider, status: response.status, cause: parsed.error },
    );
  }

  return parsed.data;
}
