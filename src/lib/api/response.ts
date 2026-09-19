import { ZodError, type ZodType } from "zod";

import { isUpstreamError, type UpstreamErrorCode } from "@/lib/chains/errors";

/**
 * Every API route speaks this envelope so the client has exactly one shape
 * to handle:  { data } on success, { error } on failure.
 */
export type ApiErrorCode = "INVALID_REQUEST" | "INTERNAL" | UpstreamErrorCode;

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  /** Zod issues for INVALID_REQUEST. */
  issues?: { path: string; message: string }[];
  provider?: string;
  retryAfter?: number;
};

export type ApiSuccess<T> = { data: T; error?: never };
export type ApiFailure = { data?: never; error: ApiError };
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

const NO_STORE = "no-store";

export function ok<T>(
  data: T,
  init: { maxAge?: number; headers?: HeadersInit } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  // Browser/TanStack may keep this briefly; our server cache is the real one.
  headers.set(
    "cache-control",
    init.maxAge ? `private, max-age=${init.maxAge}` : NO_STORE,
  );
  const body: ApiSuccess<T> = { data };
  return new Response(JSON.stringify(body), { status: 200, headers });
}

export function fail(status: number, error: ApiError, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set("content-type", "application/json; charset=utf-8");
  h.set("cache-control", NO_STORE);
  if (error.retryAfter !== undefined) h.set("retry-after", String(error.retryAfter));
  const body: ApiFailure = { error };
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function invalid(err: ZodError, message = "Invalid request"): Response {
  return fail(400, {
    code: "INVALID_REQUEST",
    message,
    issues: err.issues.map((i) => ({
      path: i.path.map(String).join(".") || "<root>",
      message: i.message,
    })),
  });
}

/** Parse URL search params through a schema, returning a 400 Response on failure. */
export function parseQuery<T>(
  searchParams: URLSearchParams,
  schema: ZodType<T>,
): { ok: true; value: T } | { ok: false; response: Response } {
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: invalid(parsed.error) };
  return { ok: true, value: parsed.data };
}

/**
 * Map any thrown value to a Response. Upstream errors keep their code and
 * status; everything else is a 500 with the details kept server-side.
 */
export function handleError(
  err: unknown,
  log: (e: unknown) => void = console.error,
): Response {
  if (err instanceof ZodError) return invalid(err);

  if (isUpstreamError(err)) {
    return fail(err.httpStatus, {
      code: err.code,
      message: err.message,
      provider: err.provider,
      ...(err.retryAfter !== undefined && { retryAfter: err.retryAfter }),
    });
  }

  log(err);
  return fail(500, { code: "INTERNAL", message: "Something went wrong on our side." });
}
