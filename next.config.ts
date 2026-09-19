import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Server-only: never expose upstream API keys to the client bundle.
  // (Keys without the NEXT_PUBLIC_ prefix are already server-only; this
  // config exists so the intent is explicit for future contributors.)
  env: {},
};

export default nextConfig;
