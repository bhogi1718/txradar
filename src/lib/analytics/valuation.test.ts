import type { DailyPrices } from "@/lib/prices/coingecko";
import { makeTx } from "@/test/factories";

import { priceAt, summarizeUsd, valueFee, valueTx } from "./valuation";

const DAY = 24 * 3600 * 1000;
const D1 = Date.UTC(2026, 8, 1);
const SERIES: DailyPrices = [
  [D1, 100],
  [D1 + DAY, 110],
  [D1 + 2 * DAY, 120],
];
const USDT = {
  symbol: "USDT",
  contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  decimals: 6,
};

describe("priceAt", () => {
  it("returns the close of the day containing the timestamp", () => {
    expect(priceAt(SERIES, D1)).toBe(100);
    expect(priceAt(SERIES, D1 + DAY + 5 * 3600 * 1000)).toBe(110);
  });

  it("uses the latest price after the series ends", () => {
    expect(priceAt(SERIES, D1 + 10 * DAY)).toBe(120);
  });

  it("refuses to guess before the series starts or inside a gap", () => {
    expect(priceAt(SERIES, D1 - 1)).toBeNull();
    expect(priceAt([], D1)).toBeNull();
    const gappy: DailyPrices = [
      [D1, 100],
      [D1 + 10 * DAY, 200],
    ];
    expect(priceAt(gappy, D1 + 5 * DAY)).toBeNull();
  });
});

describe("valueTx", () => {
  it("prices native txs on their own day", () => {
    const tx = makeTx({ timestamp: D1 + DAY, value: 2 });
    expect(valueTx(tx, { history: SERIES, current: 999 })).toEqual({
      usd: 220,
      basis: "historical",
    });
  });

  it("falls back to the current price, labeled as such", () => {
    const tx = makeTx({ timestamp: D1 - DAY, value: 2 });
    expect(valueTx(tx, { history: SERIES, current: 50 })).toEqual({
      usd: 100,
      basis: "current",
    });
    expect(valueTx(tx, {})).toBeNull();
  });

  it("prices tokens by contract at the current price", () => {
    const tx = makeTx({ asset: USDT, value: 10 });
    expect(
      valueTx(tx, { tokens: { prices: { [USDT.contract]: 1 }, unpriced: [] } }),
    ).toEqual({
      usd: 10,
      basis: "current",
    });
    expect(valueTx(tx, { tokens: { prices: {}, unpriced: [] } })).toBeNull();
  });

  it("values failed txs at zero", () => {
    expect(valueTx(makeTx({ status: "failed", value: 5 }), { current: 10 })?.usd).toBe(0);
  });

  it("prices fees in the native coin even on token transfers", () => {
    const tx = makeTx({ asset: USDT, fee: 0.5, timestamp: D1 });
    expect(valueFee(tx, { history: SERIES })).toEqual({ usd: 50, basis: "historical" });
  });
});

describe("summarizeUsd", () => {
  it("sums native flows at transaction-day prices and reports the basis", () => {
    const s = summarizeUsd(
      [
        makeTx({ direction: "in", value: 1, timestamp: D1 }),
        makeTx({ direction: "out", value: 1, fee: 0.1, timestamp: D1 + 2 * DAY }),
        makeTx({ direction: "in", value: 1, asset: USDT }), // token: excluded
      ],
      { history: SERIES },
    );
    expect(s.inflow).toBe(100);
    expect(s.outflow).toBe(120);
    expect(s.fees).toBeCloseTo(12, 10);
    expect(s.net).toBeCloseTo(100 - 120 - 12, 10);
    expect(s.basis).toBe("historical");
    expect(s.unpriced).toBe(0);
  });

  it("reports mixed basis and unpriced txs honestly", () => {
    const old = makeTx({ direction: "in", value: 1, timestamp: D1 - 5 * DAY });
    const recent = makeTx({ direction: "in", value: 1, timestamp: D1 });
    expect(summarizeUsd([old, recent], { history: SERIES, current: 1 }).basis).toBe(
      "mixed",
    );
    const s = summarizeUsd([old], { history: SERIES });
    expect(s).toMatchObject({ basis: null, unpriced: 1, inflow: 0 });
  });
});
