import { makeTx } from "@/test/factories";

import {
  applyFilters,
  DEFAULT_FILTERS,
  filterByRange,
  parseFilterParams,
  serializeFilters,
  type TxFilters,
} from "./filters";

const NOW = Date.UTC(2026, 8, 19, 12);
const HOUR = 3600 * 1000;

describe("filter params", () => {
  it("parses valid params", () => {
    expect(
      parseFilterParams(new URLSearchParams("dir=out&range=30d&q=0xabc&hideFailed=1")),
    ).toEqual({ dir: "out", range: "30d", q: "0xabc", hideFailed: true, trail: [] });
  });

  it("falls back to defaults for garbage instead of throwing", () => {
    expect(parseFilterParams(new URLSearchParams("dir=sideways&range=forever"))).toEqual(
      DEFAULT_FILTERS,
    );
  });

  it("serializes only non-defaults and round-trips", () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe("");
    const f: TxFilters = {
      dir: "in",
      range: "7d",
      q: "abc",
      hideFailed: true,
      trail: ["0xa", "0xb"],
    };
    expect(parseFilterParams(serializeFilters(f))).toEqual(f);
  });

  it("caps the drill-down trail and drops empty hops", () => {
    const trail = "a,,b, c ,d,e,f,g";
    expect(parseFilterParams(new URLSearchParams({ trail })).trail).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("filterByRange", () => {
  const txs = [
    makeTx({ timestamp: NOW - 2 * HOUR }),
    makeTx({ timestamp: NOW - 3 * 24 * HOUR }),
    makeTx({ timestamp: NOW - 60 * 24 * HOUR }),
  ];

  it("keeps everything for 'all'", () => {
    expect(filterByRange(txs, "all", NOW)).toHaveLength(3);
  });

  it.each([
    ["24h", 1],
    ["7d", 2],
    ["30d", 2],
    ["90d", 3],
  ] as const)("%s keeps %d", (range, n) => {
    expect(filterByRange(txs, range, NOW)).toHaveLength(n);
  });
});

describe("applyFilters", () => {
  const txIn = makeTx({ direction: "in", from: "0xAlice", timestamp: NOW - HOUR });
  const txOut = makeTx({
    direction: "out",
    to: "0xBob",
    method: "transfer",
    timestamp: NOW - HOUR,
  });
  const txFailed = makeTx({ direction: "out", status: "failed", timestamp: NOW - HOUR });
  const all = [txIn, txOut, txFailed];

  it("filters by direction", () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, dir: "in" }, NOW)).toEqual([txIn]);
  });

  it("hides failed on request", () => {
    expect(
      applyFilters(all, { ...DEFAULT_FILTERS, hideFailed: true }, NOW),
    ).not.toContain(txFailed);
  });

  it("searches hash, counterparty and method case-insensitively", () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, q: "alice" }, NOW)).toEqual([txIn]);
    expect(applyFilters(all, { ...DEFAULT_FILTERS, q: "TRANSFER" }, NOW)).toEqual([
      txOut,
    ]);
    expect(
      applyFilters(all, { ...DEFAULT_FILTERS, q: txFailed.hash.slice(-6) }, NOW),
    ).toEqual([txFailed]);
  });
});
