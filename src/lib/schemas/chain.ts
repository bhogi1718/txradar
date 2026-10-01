import { z } from "zod";

export const CHAINS = ["bitcoin", "ethereum", "tron"] as const;

export const chainSchema = z.enum(CHAINS);

export type Chain = z.infer<typeof chainSchema>;

export type ChainMeta = {
  id: Chain;
  name: string;
  symbol: string;
  /** Native-unit decimals (satoshi, wei, sun). */
  decimals: number;
  /** CoinGecko coin id, used for pricing. */
  coingeckoId: string;
  /** CoinGecko asset-platform id, used for token prices. */
  coingeckoPlatform: string;
  explorer: {
    tx: (hash: string) => string;
    address: (address: string) => string;
  };
};

/** The native-coin asset descriptor for a chain. */
export function nativeAsset(chain: Chain) {
  const { symbol, decimals } = CHAIN_META[chain];
  return { symbol, contract: null, decimals };
}

export const CHAIN_META: Record<Chain, ChainMeta> = {
  bitcoin: {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    decimals: 8,
    coingeckoId: "bitcoin",
    coingeckoPlatform: "bitcoin",
    explorer: {
      tx: (h) => `https://mempool.space/tx/${h}`,
      address: (a) => `https://mempool.space/address/${a}`,
    },
  },
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
    coingeckoId: "ethereum",
    coingeckoPlatform: "ethereum",
    explorer: {
      tx: (h) => `https://etherscan.io/tx/${h}`,
      address: (a) => `https://etherscan.io/address/${a}`,
    },
  },
  tron: {
    id: "tron",
    name: "Tron",
    symbol: "TRX",
    decimals: 6,
    coingeckoId: "tron",
    coingeckoPlatform: "tron",
    explorer: {
      tx: (h) => `https://tronscan.org/#/transaction/${h}`,
      address: (a) => `https://tronscan.org/#/address/${a}`,
    },
  },
};
