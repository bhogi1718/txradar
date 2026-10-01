/**
 * Display formatting. All functions are pure and locale-pinned to en-US so
 * server and client render identical strings (no hydration mismatches).
 */

const LOCALE = "en-US";

/**
 * Crypto amounts span 12+ orders of magnitude (dust to whale), so a fixed
 * number of decimals is always wrong for someone. Rules:
 *  - 0 → "0"
 *  - ≥ 1,000      → up to 2 decimals, grouped ("12,345.67")
 *  - ≥ 1          → up to 4 decimals ("1.2345")
 *  - < 1          → 4 significant digits ("0.0003731")
 *  - < 0.00000001 → "<0.00000001"
 */
export function formatAmount(value: number, options: { signed?: boolean } = {}): string {
  const sign = options.signed && value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);

  if (abs === 0) return "0";
  if (abs < 1e-8) return `${sign}<0.00000001`;

  let body: string;
  if (abs >= 1000) {
    body = abs.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
  } else if (abs >= 1) {
    body = abs.toLocaleString(LOCALE, { maximumFractionDigits: 4 });
  } else {
    body = abs.toLocaleString(LOCALE, {
      maximumSignificantDigits: 4,
      maximumFractionDigits: 10,
    });
  }
  return `${sign}${body}`;
}

/** "$1,234.56", "$0.0042", "<$0.01" with sensible precision. */
export function formatUsd(
  value: number,
  options: { signed?: boolean; compact?: boolean } = {},
): string {
  const sign = options.signed && value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) return `${sign}<$0.01`;

  if (options.compact && abs >= 10_000) {
    return (
      sign +
      abs.toLocaleString(LOCALE, {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      })
    );
  }

  return (
    sign +
    abs.toLocaleString(LOCALE, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Percentage with sign: "+4.53%", "−0.12%". */
export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600 * 1000],
  ["month", 30 * 24 * 3600 * 1000],
  ["week", 7 * 24 * 3600 * 1000],
  ["day", 24 * 3600 * 1000],
  ["hour", 3600 * 1000],
  ["minute", 60 * 1000],
];

const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto", style: "short" });

/** "3 hr. ago", "yesterday", "just now". */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  if (abs < 45 * 1000) return "just now";
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 1000), "second");
}

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** "Sep 19, 2026, 11:05". */
export function formatDateTime(timestamp: number): string {
  return dateTimeFmt.format(timestamp);
}

/** "Sep 19, 2026". */
export function formatDate(timestamp: number): string {
  return dateFmt.format(timestamp);
}

/** "1,234" */
export function formatCount(n: number): string {
  return n.toLocaleString(LOCALE);
}
