export type UpstreamErrorCode =
  | "INVALID_ADDRESS"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "SCHEMA_MISMATCH"
  | "TIMEOUT"
  | "NETWORK";

type UpstreamErrorOptions = {
  /** Which provider failed, e.g. "etherscan". */
  provider: string;
  /** HTTP status when available. */
  status?: number;
  /** Seconds until the caller may retry (from Retry-After or provider hints). */
  retryAfter?: number;
  cause?: unknown;
};

/**
 * Every failure from a chain adapter is one of these, so API routes can map
 * codes to HTTP statuses and the UI can show one consistent error surface.
 */
export class UpstreamError extends Error {
  readonly code: UpstreamErrorCode;
  readonly provider: string;
  readonly status: number | undefined;
  readonly retryAfter: number | undefined;

  constructor(code: UpstreamErrorCode, message: string, options: UpstreamErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "UpstreamError";
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }

  /** Suggested HTTP status for surfacing this error from our own API. */
  get httpStatus(): number {
    switch (this.code) {
      case "INVALID_ADDRESS":
        return 400;
      case "RATE_LIMITED":
        return 429;
      case "TIMEOUT":
        return 504;
      case "NETWORK":
      case "UPSTREAM_ERROR":
      case "SCHEMA_MISMATCH":
        return 502;
    }
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      provider: this.provider,
      ...(this.retryAfter !== undefined && { retryAfter: this.retryAfter }),
    };
  }
}

export function isUpstreamError(err: unknown): err is UpstreamError {
  return err instanceof UpstreamError;
}
