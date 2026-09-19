import { isValidTronAddress, tronBase58ToHex, tronHexToBase58 } from "./tron-address";

// Vectors computed independently (Python, sha256 double-hash + base58).
const VECTORS = [
  ["4184716914c0fdf7110a44030d04d0c4923504d9cc", "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9"],
  ["41e552f6487585c2b58bc2c9bb4492bc1f17132cd0", "TWsm8HtU2A5eEzoT8ev8yaoFjHsXLLrckb"],
] as const;

describe("tron-address", () => {
  it.each(VECTORS)("encodes %s → %s", (hex, b58) => {
    expect(tronHexToBase58(hex)).toBe(b58);
  });

  it.each(VECTORS)("decodes %s ← %s", (hex, b58) => {
    expect(tronBase58ToHex(b58)).toBe(hex);
  });

  it("accepts a 0x-prefixed hex form", () => {
    expect(tronHexToBase58("0x4184716914c0fdf7110a44030d04d0c4923504d9cc")).toBe(
      "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9",
    );
  });

  it("rejects hex that is not a 21-byte 0x41 payload", () => {
    expect(() => tronHexToBase58("84716914c0fdf7110a44030d04d0c4923504d9cc")).toThrow(
      TypeError,
    );
    expect(() => tronHexToBase58("0x1234")).toThrow(TypeError);
  });

  it("detects a corrupted checksum", () => {
    const valid = "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9";
    const tampered = valid.slice(0, -1) + (valid.endsWith("9") ? "8" : "9");
    expect(isValidTronAddress(valid)).toBe(true);
    expect(isValidTronAddress(tampered)).toBe(false);
    expect(tronBase58ToHex(tampered)).toBeNull();
  });

  it("rejects wrong length, wrong prefix and ambiguous characters", () => {
    expect(isValidTronAddress("TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m")).toBe(false); // 33 chars
    expect(isValidTronAddress("AN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9")).toBe(false); // not T
    expect(isValidTronAddress("TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb0m9")).toBe(false); // '0' not in alphabet
    expect(isValidTronAddress("")).toBe(false);
  });
});
