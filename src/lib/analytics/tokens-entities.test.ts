import { makeTx } from "@/test/factories";

import { summarizeExposure } from "./entities";
import { summarize } from "./summary";
import { summarizeTokens, tokenContracts } from "./tokens";

const USDT = {
  symbol: "USDT",
  contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  decimals: 6,
};
const SPAM = {
  symbol: "ha138 com",
  // A real, checksum-valid Tron address standing in for a spam token contract.
  contract: "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy",
  decimals: 6,
};
const TRC10 = { symbol: "TRC-10 #1005193", contract: "trc10:1005193", decimals: 0 };
const BINANCE_14 = "0x28c6c06298d514db089934071355e5743bf21d60";
const USDC_CONTRACT = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

describe("summarizeTokens", () => {
  const txs = [
    makeTx({ asset: USDT, direction: "in", value: 5, timestamp: 10 }),
    makeTx({ asset: USDT, direction: "out", value: 2, timestamp: 30 }),
    makeTx({ asset: USDT, direction: "out", value: 9, status: "failed" }),
    makeTx({ asset: SPAM, direction: "in", value: 1000, timestamp: 20 }),
    makeTx({ value: 1 }), // native: ignored
  ];

  it("groups per contract, busiest first, skipping failed", () => {
    const s = summarizeTokens(txs, { [USDT.contract]: 1 });
    expect(s.map((t) => t.asset.symbol)).toEqual(["USDT", "ha138 com"]);
    expect(s[0]).toMatchObject({
      inflow: 5,
      outflow: 2,
      count: 2,
      price: 1,
      lastSeen: 30,
    });
  });

  it("flags tokens without a price", () => {
    expect(summarizeTokens(txs)[1]!.price).toBeNull();
  });

  it("lists distinct priceable contracts, skipping TRC-10 ids", () => {
    const withTrc10 = [...txs, makeTx({ chain: "tron", asset: TRC10, value: 5 })].map(
      (t) => ({
        ...t,
        chain: "tron" as const,
      }),
    );
    expect(tokenContracts(withTrc10)).toEqual([USDT.contract, SPAM.contract].sort());
  });
});

describe("summarize (native only)", () => {
  it("keeps token amounts out of native totals but counts the txs and their fees", () => {
    const s = summarize([
      makeTx({ direction: "in", value: 1 }),
      makeTx({ direction: "in", value: 500, asset: USDT, fee: 0.2 }),
    ]);
    expect(s.inflow).toBe(1);
    expect(s.counts.in).toBe(2);
    expect(s.fees).toBe(0.2);
  });
});

describe("summarizeExposure", () => {
  it("groups labeled counterparties and computes exchange share of native volume", () => {
    const s = summarizeExposure([
      makeTx({ direction: "in", from: BINANCE_14, value: 3 }),
      makeTx({ direction: "out", to: BINANCE_14, value: 1 }),
      makeTx({
        direction: "out",
        to: USDC_CONTRACT,
        value: 0,
        category: "contract-call",
      }),
      makeTx({ direction: "in", from: "0xunknown", value: 4 }),
    ]);

    expect(s.entities.map((e) => e.label.name)).toEqual(["Binance 14", "Circle: USDC"]);
    expect(s.entities[0]).toMatchObject({ count: 2, inflow: 3, outflow: 1 });
    expect(s.exchangeShare).toBeCloseTo(4 / 8, 10);
    expect(s.labeledCount).toBe(3);
  });

  it("returns zero share and no entities for unlabeled activity", () => {
    expect(summarizeExposure([makeTx({ from: "0xnobody" })])).toEqual({
      entities: [],
      exchangeShare: 0,
      labeledCount: 0,
    });
  });
});
