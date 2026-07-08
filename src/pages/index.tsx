import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAIRS, endpointsOf, routesFor, type Direction } from "@/lib/compare/config";
import type {
  AssetSym,
  CompareResult,
  ProviderKey,
  ProviderQuote,
  RouteDef,
} from "@/lib/compare/types";

const DEFAULT_PAIR = "usdt-usdc";

/** sensible starting token-in amount per source asset */
const DEFAULT_AMOUNT: Record<AssetSym, string> = {
  BTC: "0.001",
  ETH: "0.1",
  USDT: "10",
  USDC: "10",
};

const ALL_COLS: Array<{ key: ProviderKey; label: string }> = [
  { key: "rhea", label: "Rhea (us)" },
  { key: "lifi", label: "LiFi / Jumper" },
  { key: "swapkit", label: "SwapKit" },
  { key: "rango", label: "Rango" },
  { key: "bungee", label: "Bungee" },
  { key: "kyber", label: "Kyber" },
];

const CHAIN_LABEL = (r: RouteDef) =>
  r.from.chain === r.to.chain
    ? `${r.from.chain} (same-chain)`
    : `${r.from.chain} → ${r.to.chain}`;

function fmtAmount(v: number, sym: string): string {
  const dp = sym === "BTC" ? 6 : sym === "ETH" ? 4 : 1;
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

type RowState = CompareResult | "loading" | undefined;

/** short on-cell reason so failures are diagnosable without hovering */
function errLabel(e?: string): string {
  if (!e) return "ERR";
  if (/429|rate limit|too many/i.test(e)) return "429";
  if (/no route|no liquidity/i.test(e)) return "no route";
  if (/timeout|abort/i.test(e)) return "timeout";
  return "ERR";
}

interface CellView {
  quote?: ProviderQuote;
  bps: number | null;
  isBest: boolean;
}

function cellView(row: CompareResult | undefined, key: ProviderKey): CellView {
  const quote = row?.quotes.find((q) => q.provider === key);
  if (!row || !quote || quote.status !== "ok" || !quote.amountOutHuman) {
    return { quote, bps: null, isBest: false };
  }
  const best = Math.max(
    ...row.quotes.filter((q) => q.status === "ok").map((q) => q.amountOutHuman ?? 0),
  );
  const bps = (quote.amountOutHuman / best - 1) * 10_000;
  return { quote, bps, isBest: quote.amountOutHuman === best };
}

const isValidAmount = (v: string) => /^\d{1,12}(\.\d{1,18})?$/.test(v) && Number(v) > 0;

export default function Home({ bungeeEnabled }: { bungeeEnabled: boolean }) {
  const cols = useMemo(
    () => ALL_COLS.filter((c) => c.key !== "bungee" || bungeeEnabled),
    [bungeeEnabled],
  );

  const [pairId, setPairId] = useState(DEFAULT_PAIR);
  const [dir, setDir] = useState<Direction>("forward");
  const [amtInput, setAmtInput] = useState(DEFAULT_AMOUNT.USDT);
  const [activeAmt, setActiveAmt] = useState(DEFAULT_AMOUNT.USDT);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const runId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const pair = PAIRS.find((p) => p.id === pairId)!;
  const ends = endpointsOf(pair, dir);
  const routes = useMemo(() => routesFor(pairId, dir), [pairId, dir]);

  const refresh = useCallback(async (routeList: RouteDef[], amount: string) => {
    // cancel any in-flight run so a new selection takes over immediately
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const id = ++runId.current;

    setRunning(true);
    setRows(Object.fromEntries(routeList.map((r) => [r.id, "loading" as const])));

    const queue = [...routeList];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        if (ac.signal.aborted) return;
        try {
          const res = await fetch(
            `/api/compare?route=${encodeURIComponent(r.id)}&amount=${encodeURIComponent(amount)}`,
            { signal: ac.signal },
          );
          const data: CompareResult = await res.json();
          if (runId.current !== id) return;
          setRows((prev) => ({ ...prev, [r.id]: data }));
        } catch {
          if (runId.current !== id || ac.signal.aborted) return;
          setRows((prev) => ({ ...prev, [r.id]: undefined }));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (runId.current === id) {
      setRunning(false);
      setUpdatedAt(new Date().toLocaleTimeString("en-GB"));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refresh(routesFor(DEFAULT_PAIR, "forward"), DEFAULT_AMOUNT.USDT), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  // switching pair / direction resets the amount to the new source-token default and reloads
  const selectPair = (id: string) => {
    if (id === pairId) return;
    const p = PAIRS.find((x) => x.id === id)!;
    const amt = DEFAULT_AMOUNT[endpointsOf(p, dir).from];
    setPairId(id);
    setAmtInput(amt);
    setActiveAmt(amt);
    refresh(routesFor(id, dir), amt);
  };

  const flipDir = () => {
    const nd: Direction = dir === "forward" ? "reverse" : "forward";
    const amt = DEFAULT_AMOUNT[endpointsOf(pair, nd).from];
    setDir(nd);
    setAmtInput(amt);
    setActiveAmt(amt);
    refresh(routesFor(pairId, nd), amt);
  };

  const amtValid = isValidAmount(amtInput);
  const quote = () => {
    if (!amtValid) return;
    setActiveAmt(amtInput);
    refresh(routes, amtInput);
  };

  const stop = () => {
    abortRef.current?.abort();
    runId.current++;
    setRunning(false);
  };

  // ---- stat tiles (over the current pair's routes) ----
  const loaded = routes
    .map((r) => rows[r.id])
    .filter((r): r is CompareResult => !!r && r !== "loading");
  const rheaCells = loaded.map((row) => ({ row, view: cellView(row, "rhea") }));
  const rheaQuoted = rheaCells.filter((c) => c.view.bps !== null);
  const bestCount = rheaQuoted.filter((c) => c.view.isBest).length;
  const laggards = rheaQuoted.filter((c) => !c.view.isBest);
  const avgGap = laggards.length
    ? laggards.reduce((s, c) => s + (c.view.bps ?? 0), 0) / laggards.length
    : 0;
  const worst = laggards.reduce<(typeof laggards)[number] | null>(
    (w, c) => (!w || (c.view.bps ?? 0) < (w.view.bps ?? 0) ? c : w),
    null,
  );
  const worstRoute = worst ? routes.find((r) => r.id === worst.row.routeId) : undefined;
  const okQuotes = loaded.flatMap((r) => r.quotes).filter((q) => q.status === "ok").length;
  const totalQuotes = loaded.length * cols.length;

  return (
    <>
      <Head>
        <title>Rhea · Quote Benchmark</title>
      </Head>
      <div className="bench-wrap">
        <div className="bench-top">
          <div className="bench-logo">
            <b>Rhea · Quote Benchmark</b>
            <span>vs aggregators</span>
          </div>
          <div className="bench-spacer" />
          <div className="stamp">
            {running ? (
              <span className="running-tag">
                <span className="spinner" /> pricing {ends.from} → {ends.to}…
              </span>
            ) : updatedAt ? (
              `input ${activeAmt} ${ends.from} · updated ${updatedAt}`
            ) : (
              ""
            )}
          </div>
          {running ? (
            <button className="refresh-btn stop" onClick={stop}>
              Stop
            </button>
          ) : (
            <button className="refresh-btn" onClick={() => refresh(routes, activeAmt)}>
              Refresh
            </button>
          )}
        </div>

        <div className="controls">
          <div className="seg pairs">
            {PAIRS.map((p) => (
              <button
                key={p.id}
                className={p.id === pairId ? "on" : ""}
                onClick={() => selectPair(p.id)}
              >
                {p.a} · {p.b}
              </button>
            ))}
          </div>
          <button className="dir-toggle" onClick={flipDir} title="swap direction">
            <b>{ends.from}</b>
            <span className="dir-arrow">→</span>
            <b>{ends.to}</b>
            <span className="dir-swap">⇄</span>
          </button>
          <div className="bench-spacer" />
          <div className={`amt-form ${amtValid ? "" : "invalid"}`}>
            <span className="amt-label">Token in</span>
            <input
              value={amtInput}
              inputMode="decimal"
              placeholder="e.g. 0.1"
              onChange={(e) => setAmtInput(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && quote()}
              title={`amount of ${ends.from} to swap on every route`}
            />
            <button disabled={!amtValid} onClick={quote}>
              Quote
            </button>
          </div>
        </div>

        <div className="tiles">
          <div className={`tile ${bestCount > 0 ? "win" : ""}`}>
            <div className="lab">Routes where we&apos;re best</div>
            <div className="val">
              {bestCount}
              <small>/ {rheaQuoted.length}</small>
            </div>
            <div className="sub">among routes with a Rhea quote</div>
          </div>
          <div className="tile">
            <div className="lab">Avg gap to best</div>
            <div className="val num">
              {laggards.length ? avgGap.toFixed(1) : "—"}
              <small>bps</small>
            </div>
            <div className="sub">across {laggards.length} routes we don&apos;t lead</div>
          </div>
          <div className={`tile ${worst ? "lose" : ""}`}>
            <div className="lab">Worst gap</div>
            <div className="val num">
              {worst ? (worst.view.bps ?? 0).toFixed(1) : "—"}
              <small>bps</small>
            </div>
            <div className="sub">{worstRoute ? CHAIN_LABEL(worstRoute) : ""}</div>
          </div>
          <div className="tile">
            <div className="lab">Quotes in snapshot</div>
            <div className="val num">
              {okQuotes}
              <small>/ {totalQuotes}</small>
            </div>
            <div className="sub">missing = unsupported route or no liquidity</div>
          </div>
        </div>

        <div className="panel">
          <table className="mx">
            <thead>
              <tr>
                <th>
                  {ends.from} → {ends.to} · route
                </th>
                {cols.map((p) => (
                  <th key={p.key} className={p.key === "rhea" ? "us" : ""}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => {
                const row = rows[route.id];
                return (
                  <tr key={route.id}>
                    <td className="route-cell">
                      <b>{CHAIN_LABEL(route)}</b>
                      <div className="chains">
                        {route.from.sym} → {route.to.sym}
                      </div>
                    </td>
                    {cols.map((p) => {
                      const us = p.key === "rhea" ? " us" : "";
                      if (row === "loading") {
                        return (
                          <td key={p.key} className={`cell${us}`}>
                            <span className="spinner cell-spin" />
                          </td>
                        );
                      }
                      const { quote, bps, isBest } = cellView(
                        row === undefined ? undefined : row,
                        p.key,
                      );
                      if (!quote || quote.status === "unsupported") {
                        return (
                          <td key={p.key} className={`cell${us}`}>
                            <span className="cell-na" title={quote?.error}>
                              —
                            </span>
                          </td>
                        );
                      }
                      if (quote.status === "error") {
                        return (
                          <td key={p.key} className={`cell${us}`}>
                            <span className="cell-err" title={quote.error}>
                              {errLabel(quote.error)}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={p.key} className={`cell${us}`}>
                          {isBest ? (
                            <span className="best-pill" title={quote.routeName}>
                              BEST
                            </span>
                          ) : (
                            <div
                              className={`bps num ${bps !== null && bps >= -5 ? "near" : "lag"}`}
                              title={quote.routeName}
                            >
                              {bps?.toFixed(1)}
                            </div>
                          )}
                          <div className="amt num">
                            {fmtAmount(quote.amountOutHuman ?? 0, route.to.sym)} {route.to.sym}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={cols.length + 1}>
                  Δ bps vs the best quote for the same input · cell shows estimated received
                  amount
                  <span className="legend-dot" style={{ background: "var(--good-ring)" }} />
                  best
                  <span className="legend-dot" style={{ background: "#9aa0ab" }} />
                  within 5 bps
                  <span className="legend-dot" style={{ background: "var(--bad)" }} />
                  behind &gt;5 bps · Kyber quotes same-chain EVM routes only
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

export function getServerSideProps() {
  return { props: { bungeeEnabled: !!process.env.SOCKET_API_KEY } };
}
