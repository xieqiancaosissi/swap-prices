import { fromBaseUnits, tokenOf } from "../config";
import type { ChainKey, ProviderQuote, QuoteRequest } from "../types";
import { errMessage, fetchJson, throttled } from "./util";

/**
 * Rango Basic API. public-api host works from datacenter IPs
 * (api.rango.exchange sits behind stricter Cloudflare rules).
 */
const CHAIN_NAME: Record<ChainKey, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  arbitrum: "ARBITRUM",
  base: "BASE",
  bsc: "BSC",
  solana: "SOLANA",
};

function assetId(ref: QuoteRequest["route"]["from"]): string {
  const spec = tokenOf(ref);
  const chain = CHAIN_NAME[ref.chain];
  // native: CHAIN.SYM ; token: CHAIN.SYM--address
  return spec.address ? `${chain}.${ref.sym}--${spec.address}` : `${chain}.${ref.sym}`;
}

/**
 * Swapper groups whose quotes don't deliver the native destination asset.
 * Flashnet settles "BTC" on Spark (bitcoin L2), skipping L1 network/bridge
 * fees, so its near-mid-market quotes aren't comparable to real BTC payouts.
 */
const EXCLUDED_SWAPPER_GROUPS = ["Flashnet"];

export async function quoteRango(req: QuoteRequest): Promise<ProviderQuote> {
  const apiKey = process.env.RANGO_API_KEY;
  if (!apiKey) return { provider: "rango", status: "error", error: "RANGO_API_KEY not set" };

  const { route, amountIn } = req;
  const params = new URLSearchParams({
    from: assetId(route.from),
    to: assetId(route.to),
    amount: amountIn,
    swapperGroups: EXCLUDED_SWAPPER_GROUPS.join(","),
    swappersGroupsExclude: "true",
    apiKey,
  });

  const { ok, status, body, curl, latencyMs } = await throttled("rango", 2_500, () =>
    fetchJson(`https://public-api.rango.exchange/basic/quote?${params}`),
  );

  const b = body as {
    resultType?: string;
    route?: {
      outputAmount?: string;
      estimatedTimeInSeconds?: number;
      swapper?: { title?: string };
    } | null;
  } | null;

  if (!ok) {
    return { provider: "rango", status: "error", error: errMessage(body, `HTTP ${status}`), curl, latencyMs };
  }
  if (b?.resultType !== "OK" || !b.route?.outputAmount) {
    return {
      provider: "rango",
      status: "error",
      error: b?.resultType ?? "no route",
      curl,
      latencyMs,
    };
  }

  return {
    provider: "rango",
    status: "ok",
    amountOut: b.route.outputAmount,
    amountOutHuman: fromBaseUnits(b.route.outputAmount, tokenOf(route.to).decimals),
    durationSec: b.route.estimatedTimeInSeconds,
    routeName: b.route.swapper?.title,
    curl,
    latencyMs,
  };
}
