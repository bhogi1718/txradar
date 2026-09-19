# TxRadar

A local-first crypto transaction tracker for Bitcoin, Ethereum and Tron. Enter a wallet
address, see its inflows, outflows, counterparties and exchange exposure — no signup,
no deployment, no paid services.

This is a from-scratch rebuild of an earlier vanilla HTML/JS prototype (kept at
[`../testcrypto`](../testcrypto) for reference), replacing client-exposed API keys and
unreliable data sources with a proper Next.js app.

## Stack

- **Next.js 16** (App Router) + **TypeScript** (strict, `noUncheckedIndexedAccess`)
- **Tailwind CSS 4** + **shadcn/ui** — dark-first "radar console" design system
- **TanStack Query** + **TanStack Table** — data fetching and the results grid
- **Zod** — schema validation at every trust boundary (API responses, route inputs)
- **Vitest** + **Testing Library** — unit/integration tests (`node` env for `src/lib`,
  `happy-dom` for components)

## Data sources

All calls happen server-side, in Next.js route handlers — no API key ever reaches the
browser.

| Chain    | Provider                                                                                                              | Key required?                |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Bitcoin  | [Esplora](https://github.com/Blockstream/esplora) (blockstream.info by default; mempool.space via `ESPLORA_BASE_URL`) | No                           |
| Ethereum | [Etherscan V2](https://docs.etherscan.io/etherscan-v2)                                                                | Yes (free tier)              |
| Tron     | [TronGrid](https://www.trongrid.io/)                                                                                  | No (optional, raises limits) |
| Prices   | [CoinGecko](https://www.coingecko.com/en/api) (Demo API)                                                              | No (optional, raises limits) |

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in ETHERSCAN_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command                 | Does                                                   |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | Start the dev server                                   |
| `npm run build`         | Production build                                       |
| `npm run lint`          | ESLint                                                 |
| `npm run typecheck`     | `tsc --noEmit`                                         |
| `npm test`              | Run the test suite once                                |
| `npm run test:watch`    | Run tests in watch mode                                |
| `npm run test:coverage` | Run tests with coverage                                |
| `npm run format`        | Format with Prettier                                   |
| `npm run check`         | lint + typecheck + format check + tests (what CI runs) |

A pre-commit hook (Husky + lint-staged) runs ESLint and Prettier on staged files
automatically.

## Project structure

```
src/
  app/
    api/            # Route handlers: /api/transactions, /api/prices, /api/health
    ...             # Pages, layout, design tokens (globals.css)
  components/
    brand/          # RadarMark and other brand elements
    layout/         # Site header/shell
    ui/             # shadcn/ui primitives
  lib/
    api/            # Shared request/response contracts + envelope helpers
    chains/         # Per-chain adapters (bitcoin.ts, ethereum.ts, tron.ts),
                     # address validation, unit conversion, HTTP + error helpers
    prices/         # CoinGecko client
    schemas/        # Zod schemas: Chain, Transaction
    cache.ts        # In-memory TTL cache with request coalescing
    env.ts          # Validated server-side environment
```

## Status

Built in phases; see the project plan for the full roadmap. Done so far:

- ✅ Phase 0 — Scaffold, design system, CI/CD pipeline
- ✅ Phase 1 — Chain adapters (normalized `Transaction` model, address validation,
  fixture-backed tests)
- ✅ Phase 2 — API routes (validated, cached, uniform error envelope)
- ⬜ Phase 3 — Core UI (tracking form, results table, summary cards)
- ⬜ Phase 4 — Enrichment (USD values, exchange labels, TRC-20 support)
- ⬜ Phase 5 — Drill-down, counterparty grouping, CSV export
- ⬜ Phase 6 — Hardening (pagination, error boundaries, e2e tests)

## Notes

- This app is intended to run locally only — there is no deployment target, and no
  database. Everything is fetched live from public block explorers each time.
- `.env.local` is gitignored; never commit real API keys. `.env.example` documents
  what's needed.
