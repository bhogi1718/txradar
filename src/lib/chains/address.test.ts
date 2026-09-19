import {
  isValidAddress,
  normalizeAddress,
  sameAddress,
  truncateAddress,
} from "./address";

const ETH = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const BTC_LEGACY = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const BTC_P2SH = "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo";
const BTC_BECH32 = "bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun";
const BTC_TAPROOT = "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297";
const TRX = "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy";

describe("isValidAddress", () => {
  it("ethereum: 0x + 40 hex, any casing", () => {
    expect(isValidAddress("ethereum", ETH)).toBe(true);
    expect(isValidAddress("ethereum", ETH.toLowerCase())).toBe(true);
    expect(isValidAddress("ethereum", `  ${ETH}  `)).toBe(true);
    expect(isValidAddress("ethereum", ETH.slice(0, -1))).toBe(false);
    expect(isValidAddress("ethereum", ETH.replace("0x", ""))).toBe(false);
    expect(isValidAddress("ethereum", "0xZZZZ6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
      false,
    );
  });

  it("bitcoin: legacy, P2SH, bech32, taproot", () => {
    expect(isValidAddress("bitcoin", BTC_LEGACY)).toBe(true);
    expect(isValidAddress("bitcoin", BTC_P2SH)).toBe(true);
    expect(isValidAddress("bitcoin", BTC_BECH32)).toBe(true);
    expect(isValidAddress("bitcoin", BTC_TAPROOT)).toBe(true);
    expect(isValidAddress("bitcoin", BTC_BECH32.toUpperCase())).toBe(true);
  });

  it("bitcoin: rejects mixed-case bech32 and base58 ambiguity characters", () => {
    const mixed = "bc1Q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun";
    expect(isValidAddress("bitcoin", mixed)).toBe(false);
    expect(isValidAddress("bitcoin", "1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf0a")).toBe(false); // '0'
    expect(isValidAddress("bitcoin", "bc1qinvalid")).toBe(false);
    expect(isValidAddress("bitcoin", ETH)).toBe(false);
  });

  it("tron: checksum-validated base58", () => {
    expect(isValidAddress("tron", TRX)).toBe(true);
    expect(isValidAddress("tron", TRX.slice(0, -1) + "z")).toBe(false);
    expect(isValidAddress("tron", ETH)).toBe(false);
  });
});

describe("normalizeAddress", () => {
  it("lowercases ethereum and bech32, preserves base58", () => {
    expect(normalizeAddress("ethereum", ETH)).toBe(ETH.toLowerCase());
    expect(normalizeAddress("bitcoin", BTC_BECH32.toUpperCase())).toBe(BTC_BECH32);
    expect(normalizeAddress("bitcoin", BTC_LEGACY)).toBe(BTC_LEGACY);
    expect(normalizeAddress("tron", TRX)).toBe(TRX);
  });

  it("trims whitespace", () => {
    expect(normalizeAddress("tron", `\n${TRX} `)).toBe(TRX);
  });

  it("throws on invalid input", () => {
    expect(() => normalizeAddress("ethereum", "nope")).toThrow(TypeError);
  });
});

describe("sameAddress", () => {
  it("is case-insensitive where the chain is", () => {
    expect(sameAddress("ethereum", ETH, ETH.toLowerCase())).toBe(true);
    expect(sameAddress("bitcoin", BTC_BECH32, BTC_BECH32.toUpperCase())).toBe(true);
    expect(sameAddress("bitcoin", BTC_LEGACY, BTC_LEGACY.toLowerCase())).toBe(false);
    expect(sameAddress("tron", TRX, TRX)).toBe(true);
  });

  it("never matches null", () => {
    expect(sameAddress("ethereum", null, ETH)).toBe(false);
    expect(sameAddress("ethereum", ETH, null)).toBe(false);
  });
});

describe("truncateAddress", () => {
  it("shortens long addresses and leaves short strings alone", () => {
    expect(truncateAddress(ETH)).toBe("0xd8dA…6045");
    expect(truncateAddress("coinbase")).toBe("coinbase");
    expect(truncateAddress(TRX, 4, 4)).toBe("TDU9…FEYy");
  });
});
