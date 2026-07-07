import { EVM_CHAIN_ID, addressFor, fromBaseUnits, tokenOf } from "../config";
import type { ChainKey, ProviderQuote, QuoteRequest } from "../types";
import { errMessage, fetchJson, throttled } from "./util";

/** Bungee product, Socket protocol — Swap V3 public endpoint (no auth) */
const CHAIN_ID: Record<ChainKey, string> = {
  bitcoin: "8253038",
  solana: "89999",
  ethereum: EVM_CHAIN_ID.ethereum!,
  arbitrum: EVM_CHAIN_ID.arbitrum!,
  base: EVM_CHAIN_ID.base!,
  bsc: EVM_CHAIN_ID.bsc!,
};

/** Socket uses the same native placeholder on every chain incl. BTC/SOL */
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function tokenId(ref: QuoteRequest["route"]["from"]): string {
  return tokenOf(ref).address ?? NATIVE;
}

export async function quoteBungee(req: QuoteRequest): Promise<ProviderQuote> {
  const { route, amountIn } = req;
  const fromBtc = route.from.chain === "bitcoin";
  const params = new URLSearchParams({
    userOps: fromBtc ? "tx,deposit" : "tx",
    originChainId: CHAIN_ID[route.from.chain],
    destinationChainId: CHAIN_ID[route.to.chain],
    inputToken: tokenId(route.from),
    outputToken: tokenId(route.to),
    inputAmount: amountIn,
    userAddress: addressFor(route.from.chain),
    receiverAddress: addressFor(route.to.chain),
    refundAddress: addressFor(route.from.chain),
  });

  // free dedicated key (20 rps, Google form via docs.socket.tech) lifts the
  // shared public-endpoint limits
  const apiKey = process.env.SOCKET_API_KEY;
  const host = apiKey ? "https://dedicated-backend.socket.tech" : "https://public-backend.socket.tech";
  const { ok, status, body } = await throttled("bungee", 2_000, () =>
    fetchJson(`${host}/v3/swap/quote?${params}`, {
      headers: apiKey ? { "x-api-key": apiKey } : {},
    }),
  );

  const b = body as {
    success?: boolean;
    result?: {
      routes?: Array<{
        output?: { amount?: string };
        estimatedTime?: number;
        routeDetails?: { bridgeDetails?: { protocol?: { name?: string } } };
      }>;
    };
  } | null;

  if (!ok || !b?.success) {
    return {
      provider: "bungee",
      status: "error",
      error: errMessage(body, `HTTP ${status}`),
    };
  }

  const best = b.result?.routes?.[0];
  if (!best?.output?.amount) {
    return { provider: "bungee", status: "error", error: "no route available" };
  }

  return {
    provider: "bungee",
    status: "ok",
    amountOut: best.output.amount,
    amountOutHuman: fromBaseUnits(best.output.amount, tokenOf(route.to).decimals),
    durationSec: best.estimatedTime,
    routeName: best.routeDetails?.bridgeDetails?.protocol?.name,
  };
}
