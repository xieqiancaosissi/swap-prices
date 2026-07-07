import { TIERS, toBaseUnits, tokenOf } from "./config";
import { quoteBungee } from "./providers/bungee";
import { quoteKyber } from "./providers/kyber";
import { quoteLifi } from "./providers/lifi";
import { quoteRango } from "./providers/rango";
import { quoteRhea } from "./providers/rhea";
import { quoteSwapkit } from "./providers/swapkit";
import type { CompareResult, ProviderKey, ProviderQuote, QuoteRequest, RouteDef } from "./types";

export const PROVIDERS: Record<ProviderKey, (req: QuoteRequest) => Promise<ProviderQuote>> = {
  rhea: quoteRhea,
  lifi: quoteLifi,
  bungee: quoteBungee,
  rango: quoteRango,
  swapkit: quoteSwapkit,
  kyber: quoteKyber,
};

export const PROVIDER_ORDER: ProviderKey[] = [
  "rhea",
  "lifi",
  "bungee",
  "rango",
  "swapkit",
  "kyber",
];

export async function runCompare(
  route: RouteDef,
  tier: number,
  amountOverride?: string,
): Promise<CompareResult> {
  const amountInHuman = amountOverride ?? TIERS[tier].amounts[route.from.sym];
  const req: QuoteRequest = {
    route,
    amountInHuman,
    amountIn: toBaseUnits(amountInHuman, tokenOf(route.from).decimals),
  };

  const quotes = await Promise.all(
    PROVIDER_ORDER.map(async (key): Promise<ProviderQuote> => {
      try {
        return await PROVIDERS[key](req);
      } catch (e) {
        return {
          provider: key,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  return {
    routeId: route.id,
    tier,
    amountInHuman,
    quotes,
    fetchedAt: new Date().toISOString(),
  };
}
