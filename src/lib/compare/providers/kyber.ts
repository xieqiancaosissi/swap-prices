import { fromBaseUnits, isEvm, tokenOf } from "../config";
import type { ChainKey, ProviderQuote, QuoteRequest } from "../types";
import { errMessage, fetchJson, throttled } from "./util";

/**
 * KyberSwap Aggregator API: same-chain EVM only (no cross-chain API,
 * no bitcoin/solana). Other routes report "unsupported".
 */
const CHAIN_PATH: Partial<Record<ChainKey, string>> = {
  ethereum: "ethereum",
  arbitrum: "arbitrum",
  base: "base",
  bsc: "bsc",
};

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export async function quoteKyber(req: QuoteRequest): Promise<ProviderQuote> {
  const { route, amountIn } = req;
  if (route.from.chain !== route.to.chain || !isEvm(route.from.chain)) {
    return { provider: "kyber", status: "unsupported", error: "same-chain EVM only" };
  }

  const params = new URLSearchParams({
    tokenIn: tokenOf(route.from).address ?? NATIVE,
    tokenOut: tokenOf(route.to).address ?? NATIVE,
    amountIn,
  });

  const { ok, status, body, curl, latencyMs } = await throttled("kyber", 400, () =>
    fetchJson(
      `https://aggregator-api.kyberswap.com/${CHAIN_PATH[route.from.chain]}/api/v1/routes?${params}`,
      { headers: { "x-client-id": "rhea-bench" } },
    ),
  );

  const b = body as {
    code?: number;
    data?: { routeSummary?: { amountOut?: string } };
  } | null;

  if (!ok || b?.code !== 0 || !b.data?.routeSummary?.amountOut) {
    return {
      provider: "kyber",
      status: "error",
      error: errMessage(body, `HTTP ${status}`),
      curl,
      latencyMs,
    };
  }

  const amountOut = b.data.routeSummary.amountOut;
  return {
    provider: "kyber",
    status: "ok",
    amountOut,
    amountOutHuman: fromBaseUnits(amountOut, tokenOf(route.to).decimals),
    routeName: "KyberSwap",
    curl,
    latencyMs,
  };
}
