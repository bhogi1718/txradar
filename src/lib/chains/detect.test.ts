import { detectChain, detectChains, guessChainFromPrefix } from "./detect";

describe("detectChain", () => {
  it.each([
    ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ethereum"],
    ["bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun", "bitcoin"],
    ["34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo", "bitcoin"],
    ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "bitcoin"],
    ["TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy", "tron"],
    ["  TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYy\n", "tron"],
  ] as const)("%s → %s", (address, chain) => {
    expect(detectChain(address)).toBe(chain);
    expect(detectChains(address)).toEqual([chain]);
  });

  it("returns null / [] for non-addresses", () => {
    for (const s of ["", "   ", "hello", "0x123", "TDU9XChzYjzgR6tuS27Wtgbu45kYyWFEYz"]) {
      expect(detectChain(s)).toBeNull();
      expect(detectChains(s)).toEqual([]);
    }
  });
});

describe("guessChainFromPrefix", () => {
  it("guesses while typing", () => {
    expect(guessChainFromPrefix("0x")).toBe("ethereum");
    expect(guessChainFromPrefix("0xd8dA6B")).toBe("ethereum");
    expect(guessChainFromPrefix("T")).toBe("tron");
    expect(guessChainFromPrefix("TDU9X")).toBe("tron");
    expect(guessChainFromPrefix("bc1q")).toBe("bitcoin");
    expect(guessChainFromPrefix("3M219")).toBe("bitcoin");
  });

  it("returns null for ambiguous or foreign input", () => {
    expect(guessChainFromPrefix("")).toBeNull();
    expect(guessChainFromPrefix("0")).toBeNull();
    expect(guessChainFromPrefix("0xZZ")).toBeNull();
    expect(guessChainFromPrefix("hello")).toBeNull();
  });
});
