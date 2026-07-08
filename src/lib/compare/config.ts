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

/** which chains each asset natively lives on (drives valid from/to combos) */
export const ASSET_CHAINS: Record<AssetSym, ChainKey[]> = {
  BTC: ["bitcoin"],
  ETH: ["ethereum", "arbitrum", "base"],
  USDT: ["ethereum", "arbitrum", "base", "bsc", "solana"],
  USDC: ["ethereum", "arbitrum", "base", "bsc", "solana"],
};

export type Direction = "forward" | "reverse";

export interface PairDef {
  id: string;
  a: AssetSym;
  b: AssetSym;
}

export const PAIRS: PairDef[] = [
  { id: "btc-eth", a: "BTC", b: "ETH" },
  { id: "btc-usdt", a: "BTC", b: "USDT" },
  { id: "eth-usdt", a: "ETH", b: "USDT" },
  { id: "usdt-usdc", a: "USDT", b: "USDC" },
];

/** direction-aware from/to symbols for a pair */
export function endpointsOf(pair: PairDef, dir: Direction): { from: AssetSym; to: AssetSym } {
  return dir === "forward" ? { from: pair.a, to: pair.b } : { from: pair.b, to: pair.a };
}

/** all valid source-chain → target-chain routes for a pair+direction (incl. cross-chain) */
export function routesFor(pairId: string, dir: Direction): RouteDef[] {
  const pair = PAIRS.find((p) => p.id === pairId);
  if (!pair) return [];
  const { from: fromSym, to: toSym } = endpointsOf(pair, dir);
  const routes: RouteDef[] = [];
  for (const fromChain of ASSET_CHAINS[fromSym]) {
    for (const toChain of ASSET_CHAINS[toSym]) {
      routes.push({
        id: `${pairId}:${dir}:${fromChain}:${toChain}`,
        from: { chain: fromChain, sym: fromSym },
        to: { chain: toChain, sym: toSym },
      });
    }
  }
  return routes;
}

/** full registry indexed by id, for API lookup */
const ALL_ROUTES = new Map<string, RouteDef>();
for (const p of PAIRS) {
  for (const d of ["forward", "reverse"] as Direction[]) {
    for (const r of routesFor(p.id, d)) ALL_ROUTES.set(r.id, r);
  }
}

export function routeById(id: string): RouteDef | undefined {
  return ALL_ROUTES.get(id);
}

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
