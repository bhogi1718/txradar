import { fromBaseUnits } from "./units";

describe("fromBaseUnits", () => {
  it("converts wei to ETH", () => {
    expect(fromBaseUnits("1000000000000000000", 18)).toBe(1);
    expect(fromBaseUnits("10000000000000", 18)).toBeCloseTo(0.00001, 12);
  });

  it("converts satoshi to BTC", () => {
    expect(fromBaseUnits(77000, 8)).toBeCloseTo(0.00077, 12);
    expect(fromBaseUnits("2100000000000000", 8)).toBe(21_000_000);
  });

  it("converts sun to TRX", () => {
    expect(fromBaseUnits(1_000_000, 6)).toBe(1);
    expect(fromBaseUnits(267_000, 6)).toBeCloseTo(0.267, 12);
  });

  it("keeps the integer part exact above 2^53 wei", () => {
    // 123456789.123456789123456789 ETH — a float division would drift.
    const wei = "123456789123456789123456789";
    expect(fromBaseUnits(wei, 18)).toBeCloseTo(123456789.12345679, 6);
    expect(Math.floor(fromBaseUnits(wei, 18))).toBe(123456789);
  });

  it("accepts bigint and negative amounts", () => {
    expect(fromBaseUnits(5n * 10n ** 18n, 18)).toBe(5);
    expect(fromBaseUnits(-150_000_000, 8)).toBe(-1.5);
  });

  it("rejects non-integer input", () => {
    expect(() => fromBaseUnits("1.5", 8)).toThrow(TypeError);
    expect(() => fromBaseUnits("abc", 8)).toThrow(TypeError);
    expect(() => fromBaseUnits(1, -1)).toThrow(RangeError);
  });
});
