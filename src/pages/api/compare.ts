import type { NextApiRequest, NextApiResponse } from "next";
import { routeById } from "@/lib/compare/config";
import { runCompare } from "@/lib/compare/run";
import type { CompareResult } from "@/lib/compare/types";

/** short server-side cache so refresh-spam doesn't re-hit upstream rate limits */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<CompareResult> }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const routeId = String(req.query.route ?? "");
  const amount = String(req.query.amount ?? "");

  const route = routeById(routeId);
  if (!route) return res.status(400).json({ error: `unknown route: ${routeId}` });
  if (!/^\d{1,12}(\.\d{1,18})?$/.test(amount) || Number(amount) <= 0) {
    return res.status(400).json({ error: "amount must be a positive decimal" });
  }

  const key = `${routeId}:${amount}`;
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < CACHE_TTL_MS;
  const entry = fresh ? hit : { at: Date.now(), promise: runCompare(route, amount) };
  if (!fresh) cache.set(key, entry);

  try {
    res.status(200).json(await entry.promise);
  } catch (e) {
    cache.delete(key);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
