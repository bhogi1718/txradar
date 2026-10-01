import { makeTx } from "@/test/factories";

import { bucketize, bucketStart, pickGranularity } from "./buckets";

const DAY = 24 * 3600 * 1000;

describe("pickGranularity", () => {
  it.each([
    [DAY, "hour"],
    [30 * DAY, "day"],
    [200 * DAY, "week"],
    [1000 * DAY, "month"],
  ] as const)("%d ms → %s", (span, g) => {
    expect(pickGranularity(span)).toBe(g);
  });
});

describe("bucketStart", () => {
  const ts = Date.UTC(2026, 8, 17, 15, 42); // Thursday

  it("floors to hour, day, Monday-week and month in UTC", () => {
    expect(bucketStart(ts, "hour")).toBe(Date.UTC(2026, 8, 17, 15));
    expect(bucketStart(ts, "day")).toBe(Date.UTC(2026, 8, 17));
    expect(bucketStart(ts, "week")).toBe(Date.UTC(2026, 8, 14)); // Monday
    expect(bucketStart(ts, "month")).toBe(Date.UTC(2026, 8, 1));
  });

  it("treats Sunday as the end of the week", () => {
    expect(bucketStart(Date.UTC(2026, 8, 20, 23), "week")).toBe(Date.UTC(2026, 8, 14));
  });
});

describe("bucketize", () => {
  it("returns no buckets for no data", () => {
    expect(bucketize([]).buckets).toEqual([]);
  });

  it("fills gaps with empty buckets and sums flows per bucket", () => {
    const d1 = Date.UTC(2026, 8, 1, 10);
    const d3 = Date.UTC(2026, 8, 3, 10);
    const { granularity, buckets } = bucketize(
      [
        makeTx({ timestamp: d1, direction: "in", value: 2 }),
        makeTx({ timestamp: d1 + 3600_000, direction: "out", value: 0.5 }),
        makeTx({ timestamp: d3, direction: "in", value: 1 }),
      ],
      { granularity: "day" },
    );

    expect(granularity).toBe("day");
    expect(buckets.map((b) => [b.inflow, b.outflow, b.count])).toEqual([
      [2, 0.5, 2],
      [0, 0, 0],
      [1, 0, 1],
    ]);
    expect(buckets[0]!.start).toBe(Date.UTC(2026, 8, 1));
    expect(buckets[0]!.end).toBe(Date.UTC(2026, 8, 2));
  });

  it("ignores failed txs and counts self without flow", () => {
    const ts = Date.UTC(2026, 8, 1);
    const { buckets } = bucketize(
      [
        makeTx({ timestamp: ts, status: "failed", direction: "in", value: 99 }),
        makeTx({ timestamp: ts, direction: "self", value: 5 }),
      ],
      { granularity: "day" },
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ inflow: 0, outflow: 0, count: 1 });
  });

  it("honours an explicit range even with no data in it", () => {
    const from = Date.UTC(2026, 8, 1);
    const { buckets } = bucketize([], {
      granularity: "day",
      range: { from, to: from + 2 * DAY },
    });
    expect(buckets).toHaveLength(3);
  });

  it("handles month boundaries", () => {
    const { buckets } = bucketize(
      [
        makeTx({ timestamp: Date.UTC(2026, 0, 31) }),
        makeTx({ timestamp: Date.UTC(2026, 2, 1) }),
      ],
      { granularity: "month" },
    );
    expect(buckets.map((b) => new Date(b.start).getUTCMonth())).toEqual([0, 1, 2]);
  });
});
