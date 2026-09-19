/**
 * Convert an integer base-unit amount (wei, satoshi, sun) to a JS number in
 * native units without going through a lossy float first.
 *
 * `Number(BigInt(wei)) / 1e18` loses precision once wei exceeds 2^53
 * (~0.009 ETH). Splitting into integer and fractional parts keeps the
 * integer part exact and only rounds the fraction, which is what a display
 * value needs.
 */
export function fromBaseUnits(
  amount: string | number | bigint,
  decimals: number,
): number {
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new RangeError(`decimals must be a non-negative integer, got ${decimals}`);
  }

  let big: bigint;
  try {
    big = typeof amount === "bigint" ? amount : BigInt(amount);
  } catch {
    throw new TypeError(`Not an integer amount: ${String(amount)}`);
  }

  const negative = big < 0n;
  if (negative) big = -big;

  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const fraction = big % divisor;

  const result = Number(whole) + Number(fraction) / Number(divisor);
  return negative ? -result : result;
}
