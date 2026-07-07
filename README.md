# Rhea · Quote Benchmark

Compare Rhea swap quotes against LiFi/Jumper, Bungee(Socket), Rango, SwapKit and KyberSwap
across bitcoin / ethereum / solana / arbitrum / base / bsc for the btc-eth, btc-usdt,
eth-usdt and usdt-usdc pairs.

## Setup

```bash
cp .env.example .env.local   # then fill in the keys (see comments inside)
pnpm install
pnpm dev
```

Open http://localhost:3000, enter a token-in amount and hit Quote. The amount applies to
each route's input token (BTC routes quote that many BTC, USDT routes that many USDT, …).

**Without API keys most columns will show `429` after a couple of refreshes** — the
keyless public endpoints have tiny shared rate limits. `RHEA_JWT` is required; the LiFi,
Socket and Rango keys are free and lift the limits, see `.env.example`.

## Layout

- `src/lib/compare/config.ts` — chains, token addresses/decimals, route matrix
- `src/lib/compare/providers/` — one adapter per provider (normalized quote interface)
- `src/pages/api/compare.ts` — quotes all providers server-side, 60s cache
- `src/pages/index.tsx` — the benchmark matrix page

Cells show Δbps vs the best quote for the same input; hover an error cell for the raw
upstream message. Kyber only supports same-chain EVM routes; SwapKit stays "—" until its
key is set.
