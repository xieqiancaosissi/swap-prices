import { EVM_CHAIN_ID, addressFor, fromBaseUnits, tokenOf } from "../config";
import type { ChainKey, ProviderQuote, QuoteRequest } from "../types";
import { errMessage, fetchJson, throttled } from "./util";

const CHAIN_ID: Record<ChainKey, string> = {
  bitcoin: "20000000000001",
  solana: "1151111081099710",
  ethereum: EVM_CHAIN_ID.ethereum!,
  arbitrum: EVM_CHAIN_ID.arbitrum!,
  base: EVM_CHAIN_ID.base!,
  bsc: EVM_CHAIN_ID.bsc!,
};

const NATIVE: Partial<Record<ChainKey, string>> = {
  bitcoin: "bitcoin",
  solana: "11111111111111111111111111111111",
};

function tokenId(ref: QuoteRequest["route"]["from"]): string {
  const spec = tokenOf(ref);
  if (spec.address) return spec.address;
  return NATIVE[ref.chain] ?? "0x0000000000000000000000000000000000000000";
}

export async function quoteLifi(req: QuoteRequest): Promise<ProviderQuote> {
  const { route, amountIn } = req;
  const params = new URLSearchParams({
    fromChain: CHAIN_ID[route.from.chain],
    toChain: CHAIN_ID[route.to.chain],
    fromToken: tokenId(route.from),
    toToken: tokenId(route.to),
    fromAmount: amountIn,
    fromAddress: addressFor(route.from.chain),
    toAddress: addressFor(route.to.chain),
    integrator: "rhea-bench",
    order: "CHEAPEST", // best received amount — matches what Jumper displays as 最佳报价
  });

  const headers: Record<string, string> = {};
  if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;

  const { ok, status, body } = await throttled("lifi", 600, () =>
    fetchJson(`https://li.quest/v1/quote?${params}`, { headers }),
  );

  const b = body as {
    tool?: string;
    estimate?: { toAmount?: string; executionDuration?: number };
  } | null;

  if (!ok || !b?.estimate?.toAmount) {
    return {
      provider: "lifi",
      status: "error",
      error: errMessage(body, `HTTP ${status}`),
    };
  }

  return {
    provider: "lifi",
    status: "ok",
    amountOut: b.estimate.toAmount,
    amountOutHuman: fromBaseUnits(b.estimate.toAmount, tokenOf(route.to).decimals),
    durationSec: b.estimate.executionDuration,
    routeName: b.tool,
  };
}
