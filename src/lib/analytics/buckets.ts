import { isNative, type Transaction } from "@/lib/schemas/transaction";

export type Granularity = "hour" | "day" | "week" | "month";

export type FlowBucket = {
  /** Bucket start, unix ms (UTC). */
  start: number;
  /** Bucket end (exclusive), unix ms. */
  end: number;
  inflow: number;
  outflow: number;
  count: number;
};

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Pick a granularity that yields a readable number of bars (~10–90). */
export function pickGranularity(spanMs: number): Granularity {
  if (spanMs <= 2 * DAY) return "hour";
  if (spanMs <= 90 * DAY) return "day";
  if (spanMs <= 2 * 365 * DAY) return "week";
  return "month";
}

/** Floor a timestamp to the start of its bucket (UTC; weeks start Monday). */
export function bucketStart(ts: number, g: Granularity): number {
  const d = new Date(ts);
  switch (g) {
    case "hour":
      return Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
      );
    case "day":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    case "week": {
      const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      return day - dow * DAY;
    }
    case "month":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
}

function nextBucket(start: number, g: Granularity): number {
  switch (g) {
    case "hour":
      return start + HOUR;
    case "day":
      return start + DAY;
    case "week":
      return start + WEEK;
    case "month": {
      const d = new Date(start);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
  }
}

/**
 * Group transactions into contiguous time buckets — empty buckets included
 * so gaps in activity are visible as gaps in the chart.
 *
 * `range` defaults to the span of the data. Only native-coin transfers are
 * plotted (token amounts are in other units). Failed txs are ignored (no
 * value moved); self-transfers count toward `count` but neither flow.
 */
export function bucketize(
  txs: readonly Transaction[],
  options: { granularity?: Granularity; range?: { from: number; to: number } } = {},
): { granularity: Granularity; buckets: FlowBucket[] } {
  const live = txs.filter((t) => t.status !== "failed" && isNative(t));
  if (live.length === 0 && !options.range) {
    return { granularity: options.granularity ?? "day", buckets: [] };
  }

  const from = options.range?.from ?? Math.min(...live.map((t) => t.timestamp));
  const to = options.range?.to ?? Math.max(...live.map((t) => t.timestamp));
  const granularity = options.granularity ?? pickGranularity(to - from);

  const buckets: FlowBucket[] = [];
  const index = new Map<number, FlowBucket>();
  // Hard cap protects against a pathological range × granularity combo.
  for (let s = bucketStart(from, granularity); s <= to && buckets.length < 1000;) {
    const e = nextBucket(s, granularity);
    const b: FlowBucket = { start: s, end: e, inflow: 0, outflow: 0, count: 0 };
    buckets.push(b);
    index.set(s, b);
    s = e;
  }

  for (const tx of live) {
    const b = index.get(bucketStart(tx.timestamp, granularity));
    if (!b) continue;
    b.count += 1;
    if (tx.direction === "in") b.inflow += tx.value;
    else if (tx.direction === "out") b.outflow += tx.value;
  }

  return { granularity, buckets };
}
