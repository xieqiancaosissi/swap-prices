import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTES } from "@/lib/compare/config";

const DEFAULT_AMOUNT = "1";
import type { CompareResult, ProviderKey, ProviderQuote, RouteDef } from "@/lib/compare/types";

const PROVIDER_COLS: Array<{ key: ProviderKey; label: string }> = [
  { key: "rhea", label: "Rhea (us)" },
  { key: "lifi", label: "LiFi / Jumper" },
  { key: "bungee", label: "Bungee" },
  { key: "rango", label: "Rango" },
  { key: "swapkit", label: "SwapKit" },
  { key: "kyber", label: "Kyber" },
];

const PAIR_LABEL = (r: RouteDef) => `${r.from.sym} → ${r.to.sym}`;
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

export default function Home() {
  const [amtInput, setAmtInput] = useState(DEFAULT_AMOUNT);
  const [activeAmt, setActiveAmt] = useState(DEFAULT_AMOUNT); // amount behind the current table
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const runId = useRef(0);

  const refresh = useCallback(async (amount: string) => {
    const id = ++runId.current;
    setRunning(true);
    setRows(Object.fromEntries(ROUTES.map((r) => [r.id, "loading" as const])));

    // small concurrency to stay friendly with everyone's rate limits
    const queue = [...ROUTES];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        try {
          const res = await fetch(
            `/api/compare?route=${r.id}&amount=${encodeURIComponent(amount)}`,
          );
          const data: CompareResult = await res.json();
          if (runId.current !== id) return;
          setRows((prev) => ({ ...prev, [r.id]: data }));
        } catch {
          if (runId.current !== id) return;
          setRows((prev) => ({ ...prev, [r.id]: undefined }));
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (runId.current === id) {
      setRunning(false);
      setUpdatedAt(new Date().toLocaleTimeString("en-GB"));
    }
  }, []);

  useEffect(() => {
    // initial load, deferred out of the effect body
    const t = setTimeout(() => refresh(DEFAULT_AMOUNT), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const amtValid = /^\d{1,12}(\.\d{1,18})?$/.test(amtInput) && Number(amtInput) > 0;
  const quote = () => {
    if (running || !amtValid) return;
    setActiveAmt(amtInput);
    refresh(amtInput);
  };

  // ---- stat tiles ----
  const loaded = ROUTES.map((r) => rows[r.id]).filter(
    (r): r is CompareResult => !!r && r !== "loading",
  );
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
  const worstRoute = worst ? ROUTES.find((r) => r.id === worst.row.routeId) : undefined;
  const okQuotes = loaded.flatMap((r) => r.quotes).filter((q) => q.status === "ok").length;
  const totalQuotes = loaded.length * PROVIDER_COLS.length;

  return (
    <>
      <Head>
        <title>Rhea · Quote Benchmark</title>
      </Head>
      <div className="bench-wrap">
        <div className="bench-top">
          <div className="bench-logo">
            <b>Rhea · Quote Benchmark</b>
            <span>vs 5 aggregators</span>
          </div>
          <div className="bench-spacer" />
          <div className={`amt-form ${amtValid ? "" : "invalid"}`}>
            <span className="amt-label">Token in</span>
            <input
              value={amtInput}
              disabled={running}
              inputMode="decimal"
              placeholder="e.g. 0.1"
              onChange={(e) => setAmtInput(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && quote()}
              title="amount of each route's input token (BTC routes get this many BTC, USDT routes this many USDT, …)"
            />
            <button disabled={running || !amtValid} onClick={quote}>
              Quote
            </button>
          </div>
          <div className="stamp">
            {running
              ? "fetching live quotes…"
              : updatedAt
                ? `input = ${activeAmt} of each route's token · updated ${updatedAt}`
                : ""}
          </div>
          <button className="refresh-btn" disabled={running} onClick={() => refresh(activeAmt)}>
            {running ? "Refreshing…" : "Refresh now"}
          </button>
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
            <div className="sub">
              {worstRoute ? `${PAIR_LABEL(worstRoute)} · ${CHAIN_LABEL(worstRoute)}` : ""}
            </div>
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
                <th>Route</th>
                {PROVIDER_COLS.map((p) => (
                  <th key={p.key} className={p.key === "rhea" ? "us" : ""}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROUTES.map((route) => {
                const row = rows[route.id];
                return (
                  <tr key={route.id}>
                    <td className="route-cell">
                      <b>{PAIR_LABEL(route)}</b>
                      <div className="chains">{CHAIN_LABEL(route)}</div>
                    </td>
                    {PROVIDER_COLS.map((p) => {
                      const us = p.key === "rhea" ? " us" : "";
                      if (row === "loading") {
                        return (
                          <td key={p.key} className={`cell${us}`}>
                            <span className="cell-loading">…</span>
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
                <td colSpan={PROVIDER_COLS.length + 1}>
                  Δ bps vs the best quote for the same input · cell shows estimated received
                  amount
                  <span className="legend-dot" style={{ background: "var(--good-ring)" }} />
                  best
                  <span className="legend-dot" style={{ background: "#9aa0ab" }} />
                  within 5 bps
                  <span className="legend-dot" style={{ background: "var(--bad)" }} />
                  behind &gt;5 bps · Kyber quotes same-chain routes only · SwapKit pending API
                  key
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
