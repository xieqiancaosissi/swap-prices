import { tokenOf } from "../config";
import type { ChainKey, ProviderQuote, QuoteRequest } from "../types";
import { errMessage, fetchJson, throttled } from "./util";

/**
 * SwapKit /v3/quote. Disabled until SWAPKIT_API_KEY is set
 * (register at dashboard.swapkit.dev). Note: api.swapkit.dev may
 * 403 datacenter IPs (Cloudflare) — verify once a key is available.
 */
const CHAIN_PREFIX: Record<ChainKey, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  arbitrum: "ARB",
  base: "BASE",
  bsc: "BSC",
  solana: "SOL",
};

function assetId(ref: QuoteRequest["route"]["from"]): string {
  const spec = tokenOf(ref);
  const chain = CHAIN_PREFIX[ref.chain];
  // native: CHAIN.SYM ; token: CHAIN.SYM-address (single dash, unlike Rango)
  return spec.address ? `${chain}.${ref.sym}-${spec.address}` : `${chain}.${ref.sym}`;
}

export async function quoteSwapkit(req: QuoteRequest): Promise<ProviderQuote> {
  const apiKey = process.env.SWAPKIT_API_KEY;
  if (!apiKey) {
    return { provider: "swapkit", status: "unsupported", error: "waiting for API key" };
  }

  const { route, amountInHuman } = req;
  const { ok, status, body, curl, latencyMs } = await throttled("swapkit", 600, () =>
    fetchJson(
      "https://api.swapkit.dev/v3/quote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          sellAsset: assetId(route.from),
          buyAsset: assetId(route.to),
          sellAmount: amountInHuman, // human-readable per docs (unlike the others)
          slippage: 1,
        }),
      },
    ),
  );

  const b = body as {
    routes?: Array<{
      expectedBuyAmount?: string;
      estimatedTime?: { total?: number };
      providers?: string[];
    }>;
  } | null;

  const best = b?.routes?.[0];
  if (!ok || !best?.expectedBuyAmount) {
    return {
      provider: "swapkit",
      status: "error",
      error: errMessage(body, `HTTP ${status}`),
      curl,
      latencyMs,
    };
  }

  return {
    provider: "swapkit",
    status: "ok",
    amountOutHuman: Number(best.expectedBuyAmount),
    durationSec: best.estimatedTime?.total,
    routeName: best.providers?.join("+"),
    curl,
    latencyMs,
  };
}
