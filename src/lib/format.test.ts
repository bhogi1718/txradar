import {
  formatAmount,
  formatCount,
  formatDate,
  formatDateTime,
  formatPercent,
  formatRelative,
  formatUsd,
} from "./format";

describe("formatAmount", () => {
  it.each([
    [0, "0"],
    [12345.6789, "12,345.68"],
    [1.23456789, "1.2346"],
    [0.000373131, "0.0003731"],
    [0.00001, "0.00001"],
    [1e-9, "<0.00000001"],
    [-2.5, "−2.5"],
  ])("%d → %s", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });

  it("adds + only when signed and positive", () => {
    expect(formatAmount(1.5, { signed: true })).toBe("+1.5");
    expect(formatAmount(-1.5, { signed: true })).toBe("−1.5");
    expect(formatAmount(0, { signed: true })).toBe("0");
  });
});

describe("formatUsd", () => {
  it.each([
    [0, "$0.00"],
    [0.004, "<$0.01"],
    [1234.5, "$1,234.50"],
    [-3.2, "−$3.20"],
  ])("%d → %s", (input, expected) => {
    expect(formatUsd(input)).toBe(expected);
  });

  it("compacts large values on request", () => {
    expect(formatUsd(1_234_567, { compact: true })).toBe("$1.2M");
    expect(formatUsd(9_999, { compact: true })).toBe("$9,999.00");
  });

  it("signs positive values on request", () => {
    expect(formatUsd(5, { signed: true })).toBe("+$5.00");
  });
});

describe("formatPercent", () => {
  it("signs and rounds", () => {
    expect(formatPercent(4.534)).toBe("+4.53%");
    expect(formatPercent(-0.123)).toBe("−0.12%");
    expect(formatPercent(0)).toBe("0.00%");
  });
});

describe("formatRelative", () => {
  const now = Date.UTC(2026, 8, 19, 12);
  it.each([
    [now - 10 * 1000, "just now"],
    [now - 5 * 60 * 1000, "5 min. ago"],
    [now - 3 * 3600 * 1000, "3 hr. ago"],
    [now - 24 * 3600 * 1000, "yesterday"],
    [now - 3 * 24 * 3600 * 1000, "3 days ago"],
    [now - 400 * 24 * 3600 * 1000, "last yr."],
  ])("%d → %s", (ts, expected) => {
    expect(formatRelative(ts, now)).toBe(expected);
  });
});

describe("date formatting", () => {
  it("is stable across environments (en-US pinned)", () => {
    const ts = Date.UTC(2026, 8, 19, 11, 5);
    expect(formatDate(ts)).toMatch(/^Sep 1[89], 2026$/); // TZ-dependent day
    expect(formatDateTime(ts)).toMatch(/^Sep 1[89], 2026, \d{2}:\d{2}$/);
  });

  it("groups counts", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});
