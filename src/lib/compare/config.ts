import type { AssetSym, ChainKey, RouteDef, TokenSpec } from "./types";

/**
 * Token registry. address=null means the chain-native asset.
 * NB: USDT/USDC on BSC are 18-decimals, unlike the usual 6.
 */
export const TOKENS: Record<ChainKey, Partial<Record<AssetSym, TokenSpec>>> = {
  bitcoin: {
    BTC: { address: null, decimals: 8 },
  },
  ethereum: {
    ETH: { address: null, decimals: 18 },
    USDT: { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
    USDC: { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
  },
  arbitrum: {
    ETH: { address: null, decimals: 18 },
    USDT: { address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6 },
    USDC: { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6 },
  },
  base: {
    ETH: { address: null, decimals: 18 },
    USDT: { address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", decimals: 6 },
    USDC: { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
  },
  bsc: {
    USDT: { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
    USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
  },
  solana: {
    USDT: { address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
    USDC: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  },
};

/** EVM numeric chain ids (as strings) for chains that have one */
export const EVM_CHAIN_ID: Partial<Record<ChainKey, string>> = {
  ethereum: "1",
  arbitrum: "42161",
  base: "8453",
  bsc: "56",
};

export const isEvm = (c: ChainKey) => c in EVM_CHAIN_ID;

/** Quote-only placeholder wallets per address format; no funds involved. */
export const PLACEHOLDER_ADDRESS: Record<"evm" | "bitcoin" | "solana", string> = {
  evm: "0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0",
  bitcoin: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  solana: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
};

export const addressFor = (chain: ChainKey): string =>
  chain === "bitcoin"
    ? PLACEHOLDER_ADDRESS.bitcoin
    : chain === "solana"
      ? PLACEHOLDER_ADDRESS.solana
      : PLACEHOLDER_ADDRESS.evm;

/** ~USD tiers; input amounts are fixed per asset so quotes stay comparable */
export const TIERS = [
  { label: "$100", amounts: { BTC: "0.0016", ETH: "0.056", USDT: "100", USDC: "100" } },
  { label: "$5,000", amounts: { BTC: "0.08", ETH: "2.8", USDT: "5000", USDC: "5000" } },
  { label: "$50,000", amounts: { BTC: "0.8", ETH: "28", USDT: "50000", USDC: "50000" } },
] as const;

const route = (
  id: string,
  from: [ChainKey, AssetSym],
  to: [ChainKey, AssetSym],
): RouteDef => ({
  id,
  from: { chain: from[0], sym: from[1] },
  to: { chain: to[0], sym: to[1] },
});

export const ROUTES: RouteDef[] = [
  route("btc-eth", ["bitcoin", "BTC"], ["ethereum", "ETH"]),
  route("eth-btc", ["ethereum", "ETH"], ["bitcoin", "BTC"]),
  route("btc-usdt-eth", ["bitcoin", "BTC"], ["ethereum", "USDT"]),
  route("btc-usdt-arb", ["bitcoin", "BTC"], ["arbitrum", "USDT"]),
  route("eth-usdt-same", ["ethereum", "ETH"], ["ethereum", "USDT"]),
  route("eth-usdt-arb", ["ethereum", "ETH"], ["arbitrum", "USDT"]),
  route("usdt-usdc-eth", ["ethereum", "USDT"], ["ethereum", "USDC"]),
  route("usdt-usdc-arb", ["arbitrum", "USDT"], ["arbitrum", "USDC"]),
  route("usdt-usdc-base", ["base", "USDT"], ["base", "USDC"]),
  route("usdt-usdc-bsc", ["bsc", "USDT"], ["bsc", "USDC"]),
  route("usdt-usdc-sol", ["solana", "USDT"], ["solana", "USDC"]),
  route("usdt-usdc-cross", ["ethereum", "USDT"], ["arbitrum", "USDC"]),
];

export const tokenOf = (ref: { chain: ChainKey; sym: AssetSym }): TokenSpec => {
  const t = TOKENS[ref.chain][ref.sym];
  if (!t) throw new Error(`token ${ref.sym} not configured on ${ref.chain}`);
  return t;
};

/** "0.08" + 8 decimals -> "8000000" without float rounding */
export function toBaseUnits(human: string, decimals: number): string {
  const [int, frac = ""] = human.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(int + fracPadded)).toString();
}

export function fromBaseUnits(base: string, decimals: number): number {
  return Number(base) / 10 ** decimals;
}
