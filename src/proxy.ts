import { NextResponse, type NextRequest } from "next/server";

import { buildCsp, createNonce } from "@/lib/security/csp";

/**
 * Attach a per-request CSP nonce. Next reads the nonce from the request's
 * Content-Security-Policy header and stamps it on its own scripts; the
 * layout reads x-nonce for next-themes' inline theme script.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API responses are JSON and static assets carry no scripts.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
