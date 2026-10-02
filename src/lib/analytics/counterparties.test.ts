import { makeTx } from "@/test/factories";

import { summarizeCounterparties, transactionsWith } from "./counterparties";

const BINANCE_14 = "0x28c6c06298d514db089934071355e5743bf21d60";
const USDT = {
  symbol: "USDT",
  contract: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  decimals: 6,
};

describe("summarizeCounterparties", () => {
  const txs = [
    makeTx({ direction: "in", from: "0xAAA", value: 5, timestamp: 100 }),
    makeTx({ direction: "out", to: "0xaaa", value: 2, timestamp: 300 }),
    makeTx({ direction: "out", to: "0xaaa", value: 9, status: "failed", timestamp: 400 }),
    makeTx({ direction: "in", from: BINANCE_14, value: 1, timestamp: 200 }),
    makeTx({ direction: "in", from: "0xaaa", value: 50, asset: USDT, timestamp: 250 }),
    makeTx({ direction: "self", value: 3 }),
  ];

  it("groups by counterparty case-insensitively, busiest first", () => {
    const [a, b] = summarizeCounterparties(txs);
    expect(a).toMatchObject({
      address: "0xAAA",
      count: 3,
      inflow: 5,
      outflow: 2,
      net: 3,
      tokenTransfers: 1,
      firstSeen: 100,
      lastSeen: 300,
      label: null,
    });
    expect(b!.label?.name).toBe("Binance 14");
  });

  it("skips failed txs and self-transfers", () => {
    const all = summarizeCounterparties(txs);
    expect(all).toHaveLength(2);
    expect(all.reduce((n, c) => n + c.count, 0)).toBe(4);
  });

  it("returns nothing for an empty set", () => {
    expect(summarizeCounterparties([])).toEqual([]);
  });
});

describe("transactionsWith", () => {
  it("returns every tx with that counterparty, failed included", () => {
    const txs = [
      makeTx({ direction: "in", from: "0xAAA" }),
      makeTx({ direction: "out", to: "0xaaa", status: "failed" }),
      makeTx({ direction: "out", to: "0xbbb" }),
    ];
    expect(transactionsWith(txs, "0xaaa")).toHaveLength(2);
    expect(transactionsWith(txs, "0xccc")).toEqual([]);
  });
});

describe("grouping keys", () => {
  it("keeps case-different base58 addresses apart", () => {
    const txs = [
      makeTx({ chain: "bitcoin", direction: "in", from: "1AbcDEF" }),
      makeTx({ chain: "bitcoin", direction: "in", from: "1abcdef" }),
    ];
    expect(summarizeCounterparties(txs)).toHaveLength(2);
  });

  it("merges bech32 addresses regardless of case", () => {
    const txs = [
      makeTx({ chain: "bitcoin", direction: "in", from: "bc1qabc" }),
      makeTx({ chain: "bitcoin", direction: "in", from: "BC1QABC" }),
    ];
    expect(summarizeCounterparties(txs)).toHaveLength(1);
  });
});
