import { EVM_CHAIN_ID, addressFor, fromBaseUnits, tokenOf } from "../config";
import type { ChainKey, ProviderQuote, QuoteRequest } from "../types";
import { errMessage, fetchJson, throttled } from "./util";

const CHAIN_ID: Record<ChainKey, string> = {
  bitcoin: "btc",
  solana: "solana",
  ethereum: EVM_CHAIN_ID.ethereum!,
  arbitrum: EVM_CHAIN_ID.arbitrum!,
  base: EVM_CHAIN_ID.base!,
  bsc: EVM_CHAIN_ID.bsc!,
};

const NATIVE: Partial<Record<ChainKey, string>> = {
  bitcoin: "btc",
  solana: "So11111111111111111111111111111111111111112",
};

function tokenId(ref: QuoteRequest["route"]["from"]): string {
  const spec = tokenOf(ref);
  if (spec.address) return spec.address;
  return NATIVE[ref.chain] ?? "0x0000000000000000000000000000000000000000";
}

/**
 * Quoted from the BROWSER, not the server: api.rhea.finance's Cloudflare
 * 403s datacenter egress (Vercel) regardless of headers, but its CORS is
 * wide open and viewers' residential IPs pass fine. NEXT_PUBLIC_ inlines
 * the JWT into the client bundle — same exposure as the main dapp.
 */
export async function quoteRhea(req: QuoteRequest): Promise<ProviderQuote> {
  const jwt = process.env.NEXT_PUBLIC_RHEA_JWT ?? process.env.RHEA_JWT;
  if (!jwt) return { provider: "rhea", status: "error", error: "NEXT_PUBLIC_RHEA_JWT not set" };

  const { route, amountIn } = req;
  const { ok, status, body, curl, latencyMs } = await throttled("rhea", 300, () =>
    fetchJson(
      "https://api.rhea.finance/api/swap/quote",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
          // browser-like headers: api.rhea.finance's Cloudflare 403s bare
          // datacenter requests (Vercel egress); works fine from home IPs
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        body: JSON.stringify({
          fromChain: CHAIN_ID[route.from.chain],
          toChain: CHAIN_ID[route.to.chain],
          tokenIn: tokenId(route.from),
          tokenOut: tokenId(route.to),
          amountIn,
          slippage: 100, // 1%
          sender: addressFor(route.from.chain),
          recipient: addressFor(route.to.chain),
        }),
      },
    ),
  );

  const b = body as {
    code?: number;
    msg?: string;
    data?: {
      bestQuote?: {
        amountOut?: string;
        estimatedOut?: string;
        router?: string;
        timeEstimate?: number;
      };
    };
  } | null;

  if (!ok || !b || b.code !== 0) {
    return {
      provider: "rhea",
      status: "error",
      error: errMessage(body, `HTTP ${status}`),
      curl,
      latencyMs,
    };
  }

  const best = b.data?.bestQuote;
  const amountOut = best?.amountOut ?? best?.estimatedOut;
  if (!best?.router || !amountOut) {
    return { provider: "rhea", status: "error", error: "no route in bestQuote", curl, latencyMs };
  }

  return {
    provider: "rhea",
    status: "ok",
    amountOut,
    amountOutHuman: fromBaseUnits(amountOut, tokenOf(route.to).decimals),
    durationSec: best.timeEstimate,
    routeName: best.router,
    curl,
    latencyMs,
  };
}
