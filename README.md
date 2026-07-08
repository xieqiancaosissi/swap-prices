# Rhea · Quote Benchmark

Compare Rhea swap quotes against LiFi/Jumper, Bungee(Socket), Rango, SwapKit and KyberSwap
across bitcoin / ethereum / solana / arbitrum / base / bsc for the btc-eth, btc-usdt,
eth-usdt and usdt-usdc pairs

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
Socket and Rango keys are all free and self-service and remove the 429s.

### Getting the keys (all free)

| Var | Where to get it | Effort | Effect |
|-----|-----------------|--------|--------|
| `RHEA_JWT` | copy from `multi-chain-lending` → `src/services/api/swap.ts` | — | **required** — Rhea column |
| `LIFI_API_KEY` | [portal.li.fi](https://portal.li.fi) → sign in → Create API key | instant | 75 req/2h → 100 req/min |
| `SOCKET_API_KEY` | [docs.socket.tech](https://docs.socket.tech) → "Get API Access" → Google form | short review | dedicated 20 rps |
| `RANGO_API_KEY` | Rango Discord → users-support → open a ticket (B2B use) | 1–2 days | replaces the shared demo key |
| `SWAPKIT_API_KEY` | [dashboard.swapkit.dev](https://dashboard.swapkit.dev) → register | instant | enables the SwapKit column |

These providers don't charge for API access (they earn from on-chain swap fees), so quote
keys are free with no gating — always use your own, never someone else's.

## Layout

- `src/lib/compare/config.ts` — chains, token addresses/decimals, route matrix
- `src/lib/compare/providers/` — one adapter per provider (normalized quote interface)
- `src/pages/api/compare.ts` — quotes all providers server-side, 60s cache
- `src/pages/index.tsx` — the benchmark matrix page

Cells show Δbps vs the best quote for the same input; hover an error cell for the raw
upstream message. Kyber only supports same-chain EVM routes; SwapKit stays "—" until its
key is set.
