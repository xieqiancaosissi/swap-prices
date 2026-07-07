import type { NextApiRequest, NextApiResponse } from "next";
import { ROUTES, TIERS } from "@/lib/compare/config";
import { runCompare } from "@/lib/compare/run";
import type { CompareResult } from "@/lib/compare/types";

/** short server-side cache so refresh-spam doesn't re-hit upstream rate limits */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<CompareResult> }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const routeId = String(req.query.route ?? "");
  const tier = Number(req.query.tier ?? 1);

  const route = ROUTES.find((r) => r.id === routeId);
  if (!route) return res.status(400).json({ error: `unknown route: ${routeId}` });
  if (!Number.isInteger(tier) || tier < 0 || tier >= TIERS.length) {
    return res.status(400).json({ error: `tier must be 0..${TIERS.length - 1}` });
  }

  // optional custom input amount (human units of the route's from-token)
  const amountRaw = req.query.amount ? String(req.query.amount) : undefined;
  if (amountRaw && (!/^\d{1,12}(\.\d{1,18})?$/.test(amountRaw) || Number(amountRaw) <= 0)) {
    return res.status(400).json({ error: "amount must be a positive decimal" });
  }

  const key = `${routeId}:${tier}:${amountRaw ?? ""}`;
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < CACHE_TTL_MS;
  const entry = fresh ? hit : { at: Date.now(), promise: runCompare(route, tier, amountRaw) };
  if (!fresh) cache.set(key, entry);

  try {
    res.status(200).json(await entry.promise);
  } catch (e) {
    cache.delete(key);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
