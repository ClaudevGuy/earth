import { useEffect, useMemo, useState } from "react";
import type { EarthState } from "../useEarth";
import type { ListedToken, PairFocus, RouteQuote } from "../types";
import { TokenSelect } from "./TokenSelect.tsx";
import { formatAmount, parseAmount } from "../lib/amounts.ts";
import type { IndexerFeed } from "../indexer/useIndexer.ts";
import { amountUsd } from "../indexer/value.ts";
import { bpsLabel, formatUsdish } from "../lib/format.ts";
import { canUseJupiter, pickBest, quoteEarthRoutes, quoteJupiter } from "../aggregator/router.ts";
import { executeEarthRoute } from "../amm/execute.ts";
import { findToken } from "../data/tokens.ts";
import { WSOL } from "../lib/constants.ts";
import { recordRouteFill } from "../market/tape.ts";

function FlipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M5 3.5v11M5 14.5 2.6 12M5 14.5l2.4-2.5M13 14.5v-11M13 3.5 10.6 6M13 3.5 15.4 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SwapView({
  earth,
  focus,
  feed,
}: {
  earth: EarthState;
  focus?: PairFocus;
  feed: IndexerFeed;
}) {
  const sol = earth.tokens.find((t) => t.mint === WSOL) ?? earth.tokens[0]!;
  const usdc = earth.tokens.find((t) => t.symbol === "USDC") ?? earth.tokens[1] ?? sol;
  const [input, setInput] = useState<ListedToken>(sol);
  const [output, setOutput] = useState<ListedToken>(usdc);
  const [rawIn, setRawIn] = useState("1");
  const [routes, setRoutes] = useState<RouteQuote[]>([]);
  const [picked, setPicked] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!focus?.mintA) return;
    const a = earth.tokens.find((t) => t.mint === focus.mintA);
    const b = earth.tokens.find((t) => t.mint === focus.mintB);
    if (a) setInput(a);
    if (b && b.mint !== a?.mint) setOutput(b);
  }, [focus?.mintA, focus?.mintB, earth.tokens]);

  const amountIn = useMemo(() => parseAmount(rawIn || "0", input.decimals), [rawIn, input.decimals]);
  const earthQuotes = useMemo(
    () => quoteEarthRoutes(earth.pools, earth.tokens, input.mint, output.mint, amountIn),
    [earth.pools, earth.tokens, input.mint, output.mint, amountIn],
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const extra =
        canUseJupiter(input, output, earth.standards) && amountIn > 0n
          ? await quoteJupiter(input.mint, output.mint, amountIn)
          : null;
      if (cancelled) return;
      const merged = extra ? [...earthQuotes, extra] : earthQuotes;
      merged.sort((a, b) => (BigInt(a.amountOut) < BigInt(b.amountOut) ? 1 : -1));
      setRoutes(merged);
      setPicked(pickBest(merged)?.id);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [earthQuotes, earth.standards, input, output, amountIn]);

  const selected = routes.find((r) => r.id === picked) ?? routes[0];
  const inBal = earth.balances.get(input.mint);
  const outPreview = selected ? formatAmount(BigInt(selected.amountOut), output.decimals) : "0";
  const inUsd = amountUsd(amountIn, input, feed.markets.get(input.mint), feed.solUsd);
  const outUsd = selected
    ? amountUsd(BigInt(selected.amountOut), output, feed.markets.get(output.mint), feed.solUsd)
    : 0;

  function flip() {
    setInput(output);
    setOutput(input);
  }

  function execute() {
    if (!selected) return;
    if (selected.executable !== "earth") {
      setMessage("Jupiter execution needs a Netlify JUPITER_API_KEY and a live swap path. Earth AMM routes execute here.");
      return;
    }
    setBusy(true);
    try {
      const pools = executeEarthRoute(earth.pools, selected);
      earth.setPools(pools);
      recordRouteFill({ route: selected, tokens: earth.tokens, poolsAfter: pools });
      setMessage(`Filled on ${selected.venue}. Earth AMM is in protocol preview: reserves update in this browser until the on-chain program is deployed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Swap failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="swap-grid">
      <section className="panel pad">
        <div className="panel-head">
          <span>Swap</span>
          <span>{selected ? selected.venue : "No route"}</span>
        </div>
        <div className="field-label">
          <span>You pay</span>
          <span className="field-meta">
            {earth.wallet && inBal !== undefined
              ? `Bal ${formatAmount(inBal, input.decimals)}`
              : "Connect Earth Wallet for chain balances"}
            {inUsd > 0 ? ` · ~$${formatUsdish(inUsd)}` : feed.markets.has(input.mint) ? "" : " · not on indexer"}
            {earth.wallet && inBal !== undefined ? (
              <button type="button" className="max-btn" onClick={() => setRawIn(formatAmount(inBal, input.decimals))}>
                Max
              </button>
            ) : null}
          </span>
        </div>
        <div className="token-row">
          <input value={rawIn} onChange={(e) => setRawIn(e.target.value)} inputMode="decimal" />
          <TokenSelect tokens={earth.tokens} standards={earth.standards} value={input} onChange={setInput} />
        </div>
        <button type="button" className="flip" onClick={flip} aria-label="Flip tokens">
          <FlipIcon />
        </button>
        <div className="field-label">
          <span>You receive</span>
          <span className="field-meta">
            {outUsd > 0 ? `~$${formatUsdish(outUsd)}` : selected ? selected.venue : "No route"}
          </span>
        </div>
        <div className="token-row">
          <input readOnly value={outPreview} />
          <TokenSelect tokens={earth.tokens} standards={earth.standards} value={output} onChange={setOutput} />
        </div>
        <div className="row-actions">
          <button type="button" className="primary wide" disabled={!selected || busy || amountIn <= 0n} onClick={execute}>
            {busy ? "Routing…" : "Swap on best Earth route"}
          </button>
        </div>
        {message ? <p className="notice" style={{ marginTop: 14 }}>{message}</p> : null}
      </section>
      <aside className="panel pad">
        <div className="panel-head">
          <span>Routes</span>
          <span>
            {routes.length} route{routes.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="routes">
          {routes.length === 0 ? <p className="notice">No pool yet for this pair. Create one under Liquidity.</p> : null}
          {routes.map((route) => {
            const token = findToken(output.mint, earth.tokens) ?? output;
            const best = route.id === selected?.id;
            return (
              <button
                key={route.id}
                type="button"
                className={`route${best ? " best" : ""}`}
                onClick={() => setPicked(route.id)}
              >
                <span>
                  <strong>{route.venue}</strong>
                  <div style={{ color: "var(--mute)", fontSize: 12 }}>
                    {route.hops.map((h) => h.label).join(" → ")}
                    {route.note ? ` · ${route.note}` : ""}
                  </div>
                </span>
                <span>
                  <b>{formatAmount(BigInt(route.amountOut), token.decimals)}</b>
                  <div style={{ color: "var(--mute)", fontSize: 12 }}>impact {bpsLabel(route.priceImpactBps)}</div>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
