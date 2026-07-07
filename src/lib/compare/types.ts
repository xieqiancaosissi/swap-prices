export type ChainKey =
  | "bitcoin"
  | "ethereum"
  | "arbitrum"
  | "base"
  | "bsc"
  | "solana";

export type AssetSym = "BTC" | "ETH" | "USDT" | "USDC";

export interface TokenSpec {
  /** on-chain address / mint; null = chain-native asset */
  address: string | null;
  decimals: number;
}

export interface AssetRef {
  chain: ChainKey;
  sym: AssetSym;
}

export interface RouteDef {
  id: string;
  from: AssetRef;
  to: AssetRef;
}

export interface QuoteRequest {
  route: RouteDef;
  /** input amount in base units (already scaled by decimals) */
  amountIn: string;
  /** input amount as human-readable decimal string */
  amountInHuman: string;
}

export type ProviderKey =
  | "rhea"
  | "lifi"
  | "bungee"
  | "rango"
  | "swapkit"
  | "kyber";

export interface ProviderQuote {
  provider: ProviderKey;
  status: "ok" | "error" | "unsupported";
  /** output in base units of the destination token */
  amountOut?: string;
  /** output as a float for ranking/display */
  amountOutHuman?: number;
  durationSec?: number;
  routeName?: string;
  error?: string;
}

export interface CompareResult {
  routeId: string;
  tier: number;
  amountInHuman: string;
  quotes: ProviderQuote[];
  fetchedAt: string;
}
