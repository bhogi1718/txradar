/**
 * Content-Security-Policy for every rendered page.
 *
 * Scripts are locked to a per-request nonce (+ 'strict-dynamic' so Next's
 * own chunks can load their dependencies): an injected <script> or inline
 * handler can't run. Styles keep 'unsafe-inline' because React server-renders
 * style="" attributes, which a nonce can't cover — and adding a nonce to
 * style-src would make browsers ignore 'unsafe-inline' entirely.
 *
 * The browser only ever talks to this origin: every upstream API (Etherscan,
 * Esplora, TronGrid, CoinGecko) is called from the server, so connect-src
 * stays 'self'.
 */
export function buildCsp(nonce: string, { dev = false } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // React uses eval in development to rebuild server error stacks.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** 128 bits of randomness, base64 — fresh for every request. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
