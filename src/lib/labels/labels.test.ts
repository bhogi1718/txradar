import { isValidAddress, normalizeAddress } from "@/lib/chains/address";

import { getLabel } from "./index";
import { LABELS } from "./registry";

describe("label registry", () => {
  it.each(LABELS.map((l) => [l.name, l] as const))(
    "%s is a valid, canonical address with an https source",
    (_, label) => {
      expect(isValidAddress(label.chain, label.address)).toBe(true);
      expect(normalizeAddress(label.chain, label.address)).toBe(label.address);
      expect(label.source).toMatch(/^https:\/\//);
    },
  );

  it("has no duplicate addresses per chain", () => {
    const keys = LABELS.map((l) => `${l.chain}:${l.address}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getLabel", () => {
  it("matches EVM addresses case-insensitively", () => {
    expect(getLabel("ethereum", "0x28C6c06298d514Db089934071355E5743bf21d60")?.name).toBe(
      "Binance 14",
    );
  });

  it("matches base58 addresses exactly and bech32 in either case", () => {
    expect(getLabel("bitcoin", "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo")?.kind).toBe(
      "exchange",
    );
    expect(getLabel("bitcoin", "34XP4VROCGJYM3XR7YCVPFHOCNXV4TWSEO")).toBeNull();
    expect(getLabel("bitcoin", "BC1QL49YDAPNJAFL5T2CP9ZQPJWE6PDGMXY98859V2")?.name).toBe(
      "Robinhood cold wallet",
    );
  });

  it("is chain-scoped and tolerates missing input", () => {
    expect(getLabel("tron", "0x28c6c06298d514db089934071355e5743bf21d60")).toBeNull();
    expect(getLabel("ethereum", null)).toBeNull();
    expect(getLabel("ethereum", "0x0000000000000000000000000000000000000000")).toBeNull();
  });
});
