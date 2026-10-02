import type { Page, Route } from "@playwright/test";

import type { Transaction } from "../src/lib/schemas/transaction";

export const ETH_WALLET = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
export const BTC_WALLET = "bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun";
export const TRX_WALLET = "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy";
export const BINANCE_14 = "0x28c6c06298d514db089934071355e5743bf21d60";
export const PEER = "0x00000000000000000000000000000000000000aa";
export const PEER_OF_PEER = "0x00000000000000000000000000000000000000bb";

const DAY = 24 * 3600 * 1000;
const NOW = Date.now();
let seq = 0;

export function tx(overrides: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    chain: "ethereum",
    hash: `0x${seq.toString(16).padStart(64, "0")}`,
    timestamp: NOW - seq * DAY,
    blockHeight: 1_000_000 + seq,
    from: PEER,
    to: ETH_WALLET,
    asset: { symbol: "ETH", contract: null, decimals: 18 },
    value: 1,
    fee: null,
    direction: "in",
    status: "success",
    category: "transfer",
    isContract: false,
    method: null,
    ...overrides,
  };
}

/** One page of history per cursor: pages[0] is the newest. */
export type History = Transaction[][];

export type MockOptions = {
  histories?: Record<string, History>;
  /** Make /api/transactions fail for this address (first page). */
  failWith?: Record<
    string,
    { status: number; code: string; message: string; retryAfter?: number }
  >;
};

function envelope(data: unknown) {
  return { data };
}

export const defaultHistories = (): Record<string, History> => ({
  [ETH_WALLET]: [
    [
      tx({ direction: "in", from: PEER, value: 3 }),
      tx({ direction: "out", from: ETH_WALLET, to: PEER, value: 1, fee: 0.001 }),
      tx({ direction: "in", from: BINANCE_14, value: 2 }),
      tx({
        direction: "out",
        from: ETH_WALLET,
        to: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        value: 0,
        category: "contract-call",
        isContract: true,
        method: "transfer",
        fee: 0.002,
      }),
      tx({
        direction: "out",
        from: ETH_WALLET,
        to: PEER,
        value: 9,
        status: "failed",
        fee: 0.001,
      }),
    ],
    [tx({ direction: "in", from: PEER, value: 0.5, timestamp: NOW - 400 * DAY })],
  ],
  [PEER]: [
    [
      tx({ direction: "out", from: PEER, to: ETH_WALLET, value: 3 }),
      tx({ direction: "out", from: PEER, to: PEER_OF_PEER, value: 5 }),
      tx({ direction: "in", from: PEER_OF_PEER, to: PEER, value: 1 }),
    ],
  ],
  [PEER_OF_PEER]: [[tx({ direction: "in", from: PEER, to: PEER_OF_PEER, value: 5 })]],
  [BTC_WALLET]: [
    [
      tx({
        chain: "bitcoin",
        hash: "a".repeat(64),
        from: "bc1qsender000000000000000000000000000000",
        to: BTC_WALLET,
        asset: { symbol: "BTC", contract: null, decimals: 8 },
        value: 0.25,
      }),
    ],
  ],
  [TRX_WALLET]: [
    [
      tx({
        chain: "tron",
        hash: "b".repeat(64),
        from: TRX_WALLET,
        to: "TFuie5eH4QnpMCTXbFCd9RCFoUdNnSCPiJ",
        asset: {
          symbol: "USDT",
          contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
          decimals: 6,
        },
        category: "token-transfer",
        direction: "out",
        value: 15,
        fee: 6.4,
      }),
    ],
  ],
});

/** Mock every API route the browser calls. Returns a log of requested URLs. */
export async function mockApi(page: Page, options: MockOptions = {}) {
  const histories = options.histories ?? defaultHistories();
  const requests: string[] = [];

  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);

    if (url.pathname === "/api/transactions") {
      const address = url.searchParams.get("address")!;
      const failure = options.failWith?.[address];
      if (failure && !url.searchParams.get("cursor")) {
        return route.fulfill({
          status: failure.status,
          json: {
            error: {
              code: failure.code,
              message: failure.message,
              retryAfter: failure.retryAfter,
            },
          },
        });
      }
      const pages = histories[address] ?? [[]];
      const index = Number(url.searchParams.get("cursor") ?? "0");
      return route.fulfill({
        json: envelope({
          chain: url.searchParams.get("chain"),
          address,
          transactions: pages[index] ?? [],
          nextCursor: index + 1 < pages.length ? String(index + 1) : null,
          fetchedAt: new Date().toISOString(),
          cached: false,
        }),
      });
    }

    if (url.pathname === "/api/prices") {
      const q = (usd: number) => ({ usd, change24h: 1.5, updatedAt: NOW });
      return route.fulfill({
        json: envelope({
          prices: { bitcoin: q(80_000), ethereum: q(2_500), tron: q(0.3) },
          fetchedAt: new Date().toISOString(),
          cached: false,
        }),
      });
    }

    if (url.pathname === "/api/price-history") {
      const start = Math.floor((NOW - 365 * DAY) / DAY) * DAY;
      const prices = Array.from(
        { length: 366 },
        (_, i) => [start + i * DAY, 2_000] as const,
      );
      return route.fulfill({
        json: envelope({
          chain: url.searchParams.get("chain"),
          prices,
          fetchedAt: new Date().toISOString(),
          cached: false,
        }),
      });
    }

    if (url.pathname === "/api/token-prices") {
      const contracts = (url.searchParams.get("contracts") ?? "").split(",");
      return route.fulfill({
        json: envelope({
          chain: url.searchParams.get("chain"),
          pricing: {
            prices: Object.fromEntries(
              contracts
                .filter((c) => c === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")
                .map((c) => [c, 1]),
            ),
            unpriced: [],
          },
          fetchedAt: new Date().toISOString(),
        }),
      });
    }

    return route.fulfill({
      status: 404,
      json: { error: { code: "INVALID_REQUEST", message: "unmocked" } },
    });
  });

  return requests;
}
