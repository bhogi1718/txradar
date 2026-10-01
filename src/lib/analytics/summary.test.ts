import { makeTx } from "@/test/factories";

import { counterpartyOf, summarize } from "./summary";

describe("summarize", () => {
  it("returns zeros for an empty set", () => {
    expect(summarize([])).toEqual({
      inflow: 0,
      outflow: 0,
      net: 0,
      fees: 0,
      counts: { total: 0, in: 0, out: 0, self: 0, failed: 0, pending: 0 },
      counterparties: 0,
      firstSeen: null,
      lastSeen: null,
    });
  });

  it("sums flows, fees and counts", () => {
    const s = summarize([
      makeTx({ direction: "in", value: 5, from: "0xa", timestamp: 100 }),
      makeTx({ direction: "in", value: 2, from: "0xa", timestamp: 300 }),
      makeTx({ direction: "out", value: 3, to: "0xb", fee: 0.1, timestamp: 200 }),
      makeTx({ direction: "self", value: 9, fee: 0.05, timestamp: 250 }),
    ]);

    expect(s.inflow).toBe(7);
    expect(s.outflow).toBe(3);
    expect(s.fees).toBeCloseTo(0.15, 12);
    expect(s.net).toBeCloseTo(7 - 3 - 0.15, 12);
    expect(s.counts).toEqual({ total: 4, in: 2, out: 1, self: 1, failed: 0, pending: 0 });
    expect(s.counterparties).toBe(2);
    expect(s.firstSeen).toBe(100);
    expect(s.lastSeen).toBe(300);
  });

  it("excludes failed value but still charges its fee", () => {
    const s = summarize([
      makeTx({ direction: "out", value: 10, status: "failed", fee: 0.2 }),
    ]);
    expect(s.outflow).toBe(0);
    expect(s.fees).toBe(0.2);
    expect(s.net).toBe(-0.2);
    expect(s.counts.failed).toBe(1);
  });

  it("counts pending separately while including its value", () => {
    const s = summarize([makeTx({ direction: "in", value: 1, status: "pending" })]);
    expect(s.inflow).toBe(1);
    expect(s.counts.pending).toBe(1);
  });
});

describe("counterpartyOf", () => {
  it("is the sender for inflows, recipient for outflows, null for self", () => {
    expect(counterpartyOf(makeTx({ direction: "in", from: "0xa" }))).toBe("0xa");
    expect(counterpartyOf(makeTx({ direction: "out", to: "0xb" }))).toBe("0xb");
    expect(counterpartyOf(makeTx({ direction: "self" }))).toBeNull();
  });
});
