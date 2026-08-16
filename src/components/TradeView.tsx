import { useEffect, useMemo, useState } from "react";
import type { EarthState } from "../useEarth";
import type { PairFocus, RouteQuote } from "../types";
import type { IndexerFeed } from "../indexer/useIndexer";
import { amountUsd } from "../indexer/value";
import { executeEarthRoute } from "../amm/execute";
import { findPool } from "../amm/pools";
import { canUseJupiter, pickBest, quoteEarthRoutes, quoteJupiter } from "../aggregator/router";
import { findToken } from "../data/tokens";
import { formatAmount, parseAmount } from "../lib/amounts";
import { bpsLabel, formatPct, formatPrice, formatUsdish } from "../lib/format";
import { WSOL } from "../lib/constants";
import { ammDepth } from "../market/depth";
import { invertCandles, spotPrice, uiAmount } from "../market/price";
import { nativeCandles, statsFromCandles } from "../market/series";
import { fillPrice, fillSide, fillsForPair, recordRouteFill } from "../market/tape";
import { TIMEFRAMES, type Timeframe } from "../market/types";
import { useMarketTick } from "../market/useMarketTick";
import { CandleChart } from "./CandleChart";
import { TokenAvatar } from "./TokenAvatar";

const PCTS = [25, 50, 75, 100];

export function TradeView({
  earth,
  feed,
  focus,
  onAddLiquidity,
}: {
  earth: EarthState;
  feed: IndexerFeed;
  focus?: PairFocus;
  onAddLiquidity: (next: PairFocus) => void;
}) {
  const tick = useMarketTick();
  const [poolId, setPoolId] = useState(earth.pools[0]?.id);
  const [flipped, setFlipped] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [rawIn, setRawIn] = useState("1");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [picked, setPicked] = useState<string>();

  useEffect(() => {
    if (!focus?.mintA) return;
    const found = findPool(earth.pools, focus.mintA, focus.mintB ?? WSOL);
    if (found) {
      setPoolId(found.id);
      setFlipped(found.tokenA !== focus.mintA);
    }
  }, [focus?.mintA, focus?.mintB, earth.pools]);

  useEffect(() => {
    if (poolId && earth.pools.some((p) => p.id === poolId)) return;
    setPoolId(earth.pools[0]?.id);
  }, [earth.pools, poolId]);

  const pool = earth.pools.find((p) => p.id === poolId);
  const nativeBase = pool ? findToken(pool.tokenA, earth.tokens) : undefined;
  const nativeQuote = pool ? findToken(pool.tokenB, earth.tokens) : undefined;
  const base = flipped ? nativeQuote : nativeBase;
  const quote = flipped ? nativeBase : nativeQuote;

  const nativeSeries = useMemo(() => {
    if (!pool) return [];
    return nativeCandles(pool, earth.tokens, timeframe);
  }, [pool, earth.tokens, timeframe, earth.pools, tick]);

  const candles = useMemo(
    () => (flipped ? invertCandles(nativeSeries) : nativeSeries),
    [flipped, nativeSeries],
  );

  const last = pool && base && quote ? spotPrice(pool, base.mint, quote.mint, earth.tokens) : 0;
  const nativeLast =
    pool && nativeBase && nativeQuote ? spotPrice(pool, nativeBase.mint, nativeQuote.mint, earth.tokens) : 0;
  const stats = useMemo(() => statsFromCandles(candles, last), [candles, last]);
  const depth = useMemo(
    () => (pool && base && quote ? ammDepth(pool, base.mint, quote.mint, earth.tokens) : { bids: [], asks: [] }),
    [pool, base, quote, earth.tokens, earth.pools],
  );
  const tape = useMemo(
    () => (pool && nativeBase && nativeQuote ? fillsForPair(pool, nativeBase, nativeQuote, nativeLast) : []),
    [pool, nativeBase, nativeQuote, nativeLast, tick],
  );

  const pay = side === "buy" ? quote : base;
  const receive = side === "buy" ? base : quote;
  const amountIn = useMemo(
    () => (pay ? parseAmount(rawIn || "0", pay.decimals) : 0n),
    [rawIn, pay],
  );

  const earthQuotes = useMemo(() => {
    if (!pay || !receive) return [];
    return quoteEarthRoutes(earth.pools, earth.tokens, pay.mint, receive.mint, amountIn);
  }, [earth.pools, earth.tokens, pay, receive, amountIn]);

  const [routes, setRoutes] = useState<RouteQuote[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!pay || !receive) {
        setRoutes([]);
        return;
      }
      const extra =
        canUseJupiter(pay, receive, earth.standards) && amountIn > 0n
          ? await quoteJupiter(pay.mint, receive.mint, amountIn)
          : null;
      if (cancelled) return;
      const merged = extra ? [...earthQuotes, extra] : earthQuotes;
      merged.sort((a, b) => (BigInt(a.amountOut) < BigInt(b.amountOut) ? 1 : -1));
      setRoutes(merged);
      const exec = merged.find((r) => r.executable === "earth") ?? pickBest(merged);
      setPicked(exec?.id);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [earthQuotes, earth.standards, pay, receive, amountIn]);

  const selected = routes.find((r) => r.id === picked) ?? routes.find((r) => r.executable === "earth") ?? routes[0];
  const outPreview = selected && receive ? formatAmount(BigInt(selected.amountOut), receive.decimals) : "0";
  const inBal = pay ? earth.balances.get(pay.mint) : undefined;
  const inUsd = pay ? amountUsd(amountIn, pay, feed.markets.get(pay.mint), feed.solUsd) : 0;
  const outUsd =
    selected && receive
      ? amountUsd(BigInt(selected.amountOut), receive, feed.markets.get(receive.mint), feed.solUsd)
      : 0;
  const lastUsd = base ? amountUsd(parseAmount("1", base.decimals), base, feed.markets.get(base.mint), feed.solUsd) : 0;
  const tvl =
    pool && nativeBase && nativeQuote
      ? amountUsd(BigInt(pool.reserveA), nativeBase, feed.markets.get(nativeBase.mint), feed.solUsd) +
        amountUsd(BigInt(pool.reserveB), nativeQuote, feed.markets.get(nativeQuote.mint), feed.solUsd)
      : 0;

  const markets = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return earth.pools
      .map((row) => {
        const a = findToken(row.tokenA, earth.tokens);
        const b = findToken(row.tokenB, earth.tokens);
        if (!a || !b) return null;
        const price = spotPrice(row, a.mint, b.mint, earth.tokens);
        const series = nativeCandles(row, earth.tokens, "5m");
        const st = statsFromCandles(series, price);
        const usd =
          amountUsd(BigInt(row.reserveA), a, feed.markets.get(a.mint), feed.solUsd) +
          amountUsd(BigInt(row.reserveB), b, feed.markets.get(b.mint), feed.solUsd);
        const label = `${a.symbol}/${b.symbol}`.toLowerCase();
        if (needle && !label.includes(needle) && !a.name.toLowerCase().includes(needle) && !b.name.toLowerCase().includes(needle)) {
          return null;
        }
        return { pool: row, base: a, quote: b, price, changePct: st.changePct, tvl: usd, volume: st.volume };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.tvl - a.tvl);
  }, [earth.pools, earth.tokens, feed.markets, feed.solUsd, q, tick]);

  const unpooled = useMemo(() => {
    const pooled = new Set(earth.pools.flatMap((p) => [p.tokenA, p.tokenB]));
    return earth.tokens.filter((t) => !pooled.has(t.mint) && t.mint !== WSOL);
  }, [earth.pools, earth.tokens]);

  const maxAsk = Math.max(...depth.asks.map((d) => d.total), 1);
  const maxBid = Math.max(...depth.bids.map((d) => d.total), 1);

  function setPct(pct: number) {
    if (!pay || inBal === undefined) return;
    const slice = (inBal * BigInt(pct)) / 100n;
    setRawIn(formatAmount(slice, pay.decimals));
  }

  function execute() {
    if (!selected || !base || !quote) return;
    if (selected.executable !== "earth") {
      setMessage("Jupiter is quote-only here. Pick an Earth AMM route to fill.");
      return;
    }
    setBusy(true);
    try {
      const next = executeEarthRoute(earth.pools, selected);
      earth.setPools(next);
      recordRouteFill({ route: selected, tokens: earth.tokens, poolsAfter: next });
      setMessage(`Filled ${side} ${base.symbol}/${quote.symbol} on ${selected.venue}. Preview reserves update in this browser.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fill failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="terminal">
      <aside className="panel term-markets">
        <div className="panel-head tight">
          <span>Markets</span>
          <span>{earth.pools.length} pools</span>
        </div>
        <input
          className="search-field"
          placeholder="Search listed pairs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="market-list">
          {markets.map((row) => {
            const active = row.pool.id === poolId;
            const up = row.changePct >= 0;
            return (
              <button
                key={row.pool.id}
                type="button"
                className={`market-row${active ? " active" : ""}`}
                onClick={() => {
                  setPoolId(row.pool.id);
                  setFlipped(false);
                  setMessage(undefined);
                }}
              >
                <span className="pair-marks">
                  <TokenAvatar symbol={row.base.symbol} size={22} />
                  <TokenAvatar symbol={row.quote.symbol} size={22} />
                </span>
                <span>
                  <strong>
                    {row.base.symbol}/{row.quote.symbol}
                  </strong>
                  <div className="muted">{row.pool.venue.replace("earth-", "")}</div>
                </span>
                <span className="market-px">
                  <b className="mono">{formatPrice(row.price)}</b>
                  <div className={up ? "up" : "down"}>{formatPct(row.changePct)}</div>
                </span>
              </button>
            );
          })}
        </div>
        {unpooled.length ? (
          <div className="unpooled">
            <div className="muted">Listed, no pool</div>
            {unpooled.map((token) => (
              <button
                key={token.mint}
                type="button"
                className="market-row dim"
                onClick={() => onAddLiquidity({ mintA: token.mint, mintB: WSOL })}
              >
                <TokenAvatar symbol={token.symbol} size={22} />
                <span>
                  <strong>{token.symbol}</strong>
                  <div className="muted">Create pool</div>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </aside>

      <section className="term-main">
        {pool && base && quote ? (
          <>
            <header className="panel pad term-ticker">
              <button type="button" className="pair-flip" onClick={() => setFlipped((v) => !v)}>
                <span className="pair-marks">
                  <TokenAvatar symbol={base.symbol} size={32} />
                  <TokenAvatar symbol={quote.symbol} size={32} />
                </span>
                <span>
                  <strong>
                    {base.symbol}/{quote.symbol}
                  </strong>
                  <div className="muted">
                    {pool.venue} · {bpsLabel(pool.feeBps)} fee · flip pair
                  </div>
                </span>
              </button>
              <div className="ticker-stats">
                <div>
                  <span>Last</span>
                  <strong className="mono">{lastUsd > 0 ? `$${formatPrice(lastUsd)}` : formatPrice(stats.last)}</strong>
                  <small className="muted">{formatPrice(stats.last)} {quote.symbol}</small>
                </div>
                <div>
                  <span>24h</span>
                  <strong className={stats.changePct >= 0 ? "up" : "down"}>{formatPct(stats.changePct)}</strong>
                </div>
                <div>
                  <span>High / Low</span>
                  <strong className="mono">
                    {formatPrice(stats.high)}
                    <small className="muted"> / {formatPrice(stats.low)}</small>
                  </strong>
                </div>
                <div>
                  <span>24h vol</span>
                  <strong className="mono">{formatUsdish(stats.volume)}</strong>
                </div>
                <div>
                  <span>TVL</span>
                  <strong className="mono">{tvl > 0 ? `$${formatUsdish(tvl)}` : "—"}</strong>
                </div>
              </div>
            </header>

            <div className="panel chart-panel">
              <div className="tf-row">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    className={tf === timeframe ? "active" : ""}
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf}
                  </button>
                ))}
                <span className="muted chart-note">Earth AMM series from pool reserves</span>
              </div>
              <CandleChart candles={candles} height={360} />
            </div>

            <div className="term-bottom">
              <div className="panel pad">
                <div className="panel-head tight">
                  <span>Trades</span>
                  <span>tape</span>
                </div>
                <div className="tape">
                  <div className="tape-head">
                    <span>Time</span>
                    <span>Side</span>
                    <span>Price</span>
                    <span>Size</span>
                  </div>
                  {tape.map((fill) => {
                    const dir = fillSide(fill, base.mint, quote.mint);
                    const px = fillPrice(fill, base, quote);
                    const size =
                      dir === "buy"
                        ? uiAmount(fill.amountOut, base.decimals)
                        : dir === "sell"
                          ? uiAmount(fill.amountIn, base.decimals)
                          : 0;
                    return (
                      <div key={fill.id} className={`tape-row ${dir ?? ""}`}>
                        <span className="mono muted">{new Date(fill.time).toLocaleTimeString()}</span>
                        <span className={dir === "buy" ? "up" : dir === "sell" ? "down" : "muted"}>
                          {dir ?? "hop"}
                          {fill.live ? " · you" : ""}
                        </span>
                        <span className="mono">{px ? formatPrice(px) : "—"}</span>
                        <span className="mono">{size ? formatUsdish(size) : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="panel pad">
                <div className="panel-head tight">
                  <span>Depth</span>
                  <span>AMM curve</span>
                </div>
                <div className="depth">
                  {[...depth.asks].reverse().map((level, i) => (
                    <div key={`a${i}`} className="depth-row ask">
                      <span className="mono down">{formatPrice(level.price)}</span>
                      <span className="mono">{formatUsdish(level.size)}</span>
                      <i style={{ width: `${(level.total / maxAsk) * 100}%` }} />
                    </div>
                  ))}
                  <div className="depth-mid mono">{formatPrice(stats.last)} {quote.symbol}</div>
                  {depth.bids.map((level, i) => (
                    <div key={`b${i}`} className="depth-row bid">
                      <span className="mono up">{formatPrice(level.price)}</span>
                      <span className="mono">{formatUsdish(level.size)}</span>
                      <i style={{ width: `${(level.total / maxBid) * 100}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="panel pad">
            <div className="panel-head">
              <span>No Earth pool yet</span>
            </div>
            <p className="lede">List a token and seed a pool to trade it here. Custom standards including u128 are first-class.</p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={() => onAddLiquidity({ mintA: WSOL })}>
                Create a pool
              </button>
            </div>
          </div>
        )}
      </section>

      <aside className="panel pad term-ticket">
        <div className="panel-head tight">
          <span>Order</span>
          <span>market · AMM</span>
        </div>
        <div className="side-toggle">
          <button type="button" className={side === "buy" ? "buy on" : "buy"} onClick={() => setSide("buy")}>
            Buy {base?.symbol ?? "base"}
          </button>
          <button type="button" className={side === "sell" ? "sell on" : "sell"} onClick={() => setSide("sell")}>
            Sell {base?.symbol ?? "base"}
          </button>
        </div>
        <div className="field-label">
          <span>You pay {pay?.symbol ?? ""}</span>
          <span className="field-meta">
            {earth.wallet && inBal !== undefined && pay
              ? `Bal ${formatAmount(inBal, pay.decimals)}`
              : "Connect Earth Wallet"}
            {inUsd > 0 ? ` · ~$${formatUsdish(inUsd)}` : ""}
          </span>
        </div>
        <div className="token-row compact">
          <input value={rawIn} onChange={(e) => setRawIn(e.target.value)} inputMode="decimal" />
          {pay ? <span className="ticket-asset">{pay.symbol}</span> : null}
        </div>
        <div className="pct-row">
          {PCTS.map((pct) => (
            <button key={pct} type="button" className="ghost" disabled={inBal === undefined} onClick={() => setPct(pct)}>
              {pct}%
            </button>
          ))}
        </div>
        <div className="field-label">
          <span>You receive {receive?.symbol ?? ""}</span>
          <span className="field-meta">{outUsd > 0 ? `~$${formatUsdish(outUsd)}` : selected ? selected.venue : "No route"}</span>
        </div>
        <div className="token-row compact">
          <input readOnly value={outPreview} />
          {receive ? <span className="ticket-asset">{receive.symbol}</span> : null}
        </div>
        {selected ? (
          <p className="ticket-meta">
            {selected.venue} · impact {bpsLabel(selected.priceImpactBps)}
            {selected.note ? ` · ${selected.note}` : ""}
          </p>
        ) : (
          <p className="ticket-meta">No Earth route for this pair. Seed liquidity first.</p>
        )}
        <div className="routes slim">
          {routes.slice(0, 3).map((route) => (
            <button
              key={route.id}
              type="button"
              className={`route${route.id === selected?.id ? " best" : ""}`}
              onClick={() => setPicked(route.id)}
            >
              <span>{route.venue}</span>
              <span className="mono">{receive ? formatAmount(BigInt(route.amountOut), receive.decimals, 4) : ""}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`primary wide ${side === "sell" ? "sell-cta" : "buy-cta"}`}
          disabled={!selected || busy || amountIn <= 0n || !pool}
          onClick={execute}
        >
          {busy ? "Filling…" : `${side === "buy" ? "Buy" : "Sell"} ${base?.symbol ?? ""}`}
        </button>
        {message ? <p className="notice" style={{ marginTop: 12 }}>{message}</p> : null}
      </aside>
    </div>
  );
}
