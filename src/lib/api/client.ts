import type { ZodType } from "zod";

import type { ApiError, ApiErrorCode } from "./response";

/**
 * Browser-side counterpart to lib/api/response. Unwraps the { data } |
 * { error } envelope, validates data against the shared contract schema,
 * and throws a typed error the UI can branch on.
 */
export class ApiClientError extends Error {
  readonly code: ApiErrorCode | "NETWORK" | "BAD_RESPONSE";
  readonly status: number;
  readonly retryAfter: number | undefined;
  readonly provider: string | undefined;

  constructor(
    code: ApiClientError["code"],
    message: string,
    init: { status?: number; retryAfter?: number; provider?: string } = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = init.status ?? 0;
    this.retryAfter = init.retryAfter;
    this.provider = init.provider;
  }

  /** Errors worth retrying automatically (transient upstream trouble). */
  get isTransient(): boolean {
    return ["TIMEOUT", "NETWORK", "UPSTREAM_ERROR"].includes(this.code);
  }
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiError).code === "string" &&
    typeof (value as ApiError).message === "string"
  );
}

export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  init: { signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      signal: init.signal,
      headers: { accept: "application/json" },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiClientError("NETWORK", "Could not reach the TxRadar server.");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiClientError(
      "BAD_RESPONSE",
      `Unexpected response (HTTP ${res.status}).`,
      {
        status: res.status,
      },
    );
  }

  const envelope = body as { data?: unknown; error?: unknown };
  if (!res.ok || envelope.error !== undefined) {
    const e = envelope.error;
    if (isApiError(e)) {
      throw new ApiClientError(e.code, e.message, {
        status: res.status,
        retryAfter: e.retryAfter,
        provider: e.provider,
      });
    }
    throw new ApiClientError("BAD_RESPONSE", `Request failed (HTTP ${res.status}).`, {
      status: res.status,
    });
  }

  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new ApiClientError(
      "BAD_RESPONSE",
      "The server returned data in an unexpected shape.",
      {
        status: res.status,
      },
    );
  }
  return parsed.data;
}
