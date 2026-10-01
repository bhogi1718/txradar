import type { Chain } from "@/lib/schemas/chain";

export type LabelKind = "exchange" | "token" | "protocol";

export type AddressLabel = {
  chain: Chain;
  address: string;
  name: string;
  kind: LabelKind;
  /** Public page the label was verified against. */
  source: string;
};

/**
 * Curated address labels. Every entry was checked against the public name
 * tag on the linked explorer page on 2026-10-01. Add only what you can
 * verify the same way: a wrong "Binance" tag is worse than no tag.
 *
 * Addresses are stored in each chain's canonical form (see normalizeAddress);
 * a test enforces this.
 */
export const LABELS: readonly AddressLabel[] = [
  // --- Ethereum: exchanges ------------------------------------------------
  {
    chain: "ethereum",
    address: "0x28c6c06298d514db089934071355e5743bf21d60",
    name: "Binance 14",
    kind: "exchange",
    source: "https://etherscan.io/address/0x28C6c06298d514Db089934071355E5743bf21d60",
  },
  {
    chain: "ethereum",
    address: "0x21a31ee1afc51d94c2efccaa2092ad1028285549",
    name: "Binance 15",
    kind: "exchange",
    source: "https://etherscan.io/address/0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549",
  },
  {
    chain: "ethereum",
    address: "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8",
    name: "Binance 7",
    kind: "exchange",
    source: "https://etherscan.io/address/0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
  },
  {
    chain: "ethereum",
    address: "0x2910543af39aba0cd09dbb2d50200b3e800a63d2",
    name: "Kraken 1",
    kind: "exchange",
    source: "https://etherscan.io/address/0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2",
  },
  {
    chain: "ethereum",
    address: "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43",
    name: "Coinbase 10",
    kind: "exchange",
    source: "https://etherscan.io/address/0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43",
  },
  {
    chain: "ethereum",
    address: "0x71660c4005ba85c37ccec55d0c4493e66fe775d3",
    name: "Coinbase 1",
    kind: "exchange",
    source: "https://etherscan.io/address/0x71660c4005BA85c37ccec55d0C4493E66Fe775d3",
  },
  {
    chain: "ethereum",
    address: "0x742d35cc6634c0532925a3b844bc454e4438f44e",
    name: "Bitfinex 2",
    kind: "exchange",
    source: "https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  },
  {
    chain: "ethereum",
    address: "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b",
    name: "OKX",
    kind: "exchange",
    source: "https://etherscan.io/address/0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b",
  },
  {
    chain: "ethereum",
    address: "0xd24400ae8bfebb18ca49be86258a3c749cf46853",
    name: "Gemini",
    kind: "exchange",
    source: "https://etherscan.io/address/0xd24400ae8BfEBb18cA49Be86258a3C749cf46853",
  },

  // --- Ethereum: tokens & protocols ---------------------------------------
  {
    chain: "ethereum",
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    name: "Tether: USDT",
    kind: "token",
    source: "https://etherscan.io/address/0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  {
    chain: "ethereum",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    name: "Circle: USDC",
    kind: "token",
    source: "https://etherscan.io/address/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    chain: "ethereum",
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    name: "Wrapped Ether",
    kind: "token",
    source: "https://etherscan.io/address/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  {
    chain: "ethereum",
    address: "0x231b0ee14048e9dccd1d247744d114a4eb5e8e63",
    name: "ENS: Public Resolver",
    kind: "protocol",
    source: "https://etherscan.io/address/0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
  },
  {
    chain: "ethereum",
    address: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
    name: "Uniswap: Universal Router",
    kind: "protocol",
    source: "https://etherscan.io/address/0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  },

  // --- Bitcoin ------------------------------------------------------------
  {
    chain: "bitcoin",
    address: "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
    name: "Binance cold wallet",
    kind: "exchange",
    source:
      "https://bitinfocharts.com/bitcoin/address/34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
  },
  {
    chain: "bitcoin",
    address: "bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2",
    name: "Robinhood cold wallet",
    kind: "exchange",
    source:
      "https://bitinfocharts.com/bitcoin/address/bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2",
  },

  // --- Tron ---------------------------------------------------------------
  {
    chain: "tron",
    address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    name: "Tether: USDT",
    kind: "token",
    // TronGrid's own token metadata for this contract: "Tether USD" / USDT.
    source: "https://api.trongrid.io/v1/accounts/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  },
];
