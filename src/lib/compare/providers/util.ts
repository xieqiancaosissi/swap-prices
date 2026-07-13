export const QUOTE_TIMEOUT_MS = 25_000;

/**
 * Per-provider serialization with a minimum gap between calls, so a
 * full-matrix refresh doesn't trip upstream rate limits (Kyber 3rps,
 * Rango demo key, Socket public endpoint...).
 */
const chains: Record<string, Promise<void>> = {};

export function throttled<T>(key: string, minGapMs: number, fn: () => Promise<T>): Promise<T> {
  const prev = chains[key] ?? Promise.resolve();
  let release!: () => void;
  chains[key] = new Promise<void>((res) => (release = res));
  return prev.then(async () => {
    try {
      return await fn();
    } finally {
      setTimeout(release, minGapMs);
    }
  });
}

/** reproduce a fetch call as a copy-paste-runnable curl (real keys included) */
export function buildCurl(url: string, init: RequestInit): string {
  const parts = [`curl '${url}'`];
  if (init.method && init.method !== "GET") parts.push(`-X ${init.method}`);
  const headers = (init.headers as Record<string, string>) ?? {};
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`-H '${k}: ${v}'`);
  }
  if (init.body) parts.push(`-d '${String(init.body)}'`);
  return parts.join(" ");
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const BACKOFFS_MS = [3_000, 8_000];

/**
 * Hosts that kept returning 429 after retries get a short cooldown during which
 * we fail fast (single attempt), so one exhausted provider can't stall a whole
 * matrix refresh behind backoff sleeps. Kept short so a transient 429 (common on
 * the shared Rango demo key) self-heals within a refresh or two rather than
 * blacking out the column for minutes.
 */
const BREAKER_MS = 60_000;
const brokenUntil = new Map<string, number>();

export async function fetchJson(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown; curl: string; latencyMs: number }> {
  const curl = buildCurl(url, init);
  const host = new URL(url).host;
  const tripped = (brokenUntil.get(host) ?? 0) > Date.now();

  // time only the request round-trip, not our own throttle/backoff waits;
  // on retries keep the last (successful) attempt's latency
  const timed = async () => {
    const t0 = performance.now();
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) });
    return { r, ms: performance.now() - t0 };
  };

  let { r: res, ms: latencyMs } = await timed();
  if (!tripped) {
    for (const backoff of BACKOFFS_MS) {
      if (res.status !== 429) break;
      await sleep(backoff);
      ({ r: res, ms: latencyMs } = await timed());
    }
  }
  if (res.status === 429) brokenUntil.set(host, Date.now() + BREAKER_MS);
  else brokenUntil.delete(host);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { ok: res.ok, status: res.status, body, curl, latencyMs };
}

export function errMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const key of ["message", "msg", "error"]) {
      if (typeof b[key] === "string" && b[key]) return b[key] as string;
    }
  }
  if (typeof body === "string" && body) return body.slice(0, 200);
  return fallback;
}
