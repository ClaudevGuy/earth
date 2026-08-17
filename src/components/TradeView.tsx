import { useEffect, useMemo, useState } from "react";
import type { EarthState } from "../useEarth";
import type { PairFocus } from "../types";
import type { IndexerFeed } from "../indexer/useIndexer";
import { amountUsd } from "../indexer/value";
import { findPool } from "../amm/pools";
import { pickBest, quoteEarthRoutes } from "../aggregator/router";
import { findToken } from "../data/tokens";
import { formatAmount, parseAmount } from "../lib/amounts";
import { bpsLabel, formatPct, formatPrice, formatUsdish } from "../lib/format";
import { WSOL } from "../lib/constants";
import { quoteBuy, quoteSell, progressBps, spotSolPerToken, type CurveQuote } from "../launchpad/curve";
import { ammDepth } from "../market/depth";
import { invertCandles, spotPrice, uiAmount } from "../market/price";
import { candlesForId, nativeCandles, statsFromCandles } from "../market/series";
import { fillPrice, fillSide, fillsForPair } from "../market/tape";
import { TIMEFRAMES, type Timeframe } from "../market/types";
import { useMarketTick } from "../market/useMarketTick";
import { CandleChart } from "./CandleChart";
import { TokenAvatar } from "./TokenAvatar";

const PCTS = [25, 50, 75, 100];

function launchMarketId(mint: string) {
  return `launch:${mint}`;
}

function launchHolding(earth: EarthState, mint: string): bigint {
  const owner = earth.wallet ?? "local";
  const row = earth.launchHoldings.find((h) => h.mint === mint && h.owner === owner);
  return row ? BigInt(row.amount) : 0n;
}

export function TradeView({
  earth,
  feed,
  focus,
  onAddLiquidity,
  onOpenLaunchpad,
}: {
  earth: EarthState;
  feed: IndexerFeed;
  focus?: PairFocus;
  onAddLiquidity: (next: PairFocus) => void;
  onOpenLaunchpad: () => void;
}) {
  const tick = useMarketTick();
  const liveLaunches = earth.launches.filter((c) => !c.graduated);
  const [marketId, setMarketId] = useState(
    earth.pools[0]?.id ?? (liveLaunches[0] ? launchMarketId(liveLaunches[0].mint) : undefined),
  );
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
    const live = earth.launches.find((c) => !c.graduated && c.mint === focus.mintA);
    if (live) {
      setMarketId(launchMarketId(live.mint));
      setFlipped(false);
      return;
    }
    const found = findPool(earth.pools, focus.mintA, focus.mintB ?? WSOL);
    if (found) {
      setMarketId(found.id);
      setFlipped(found.tokenA !== focus.mintA);
    }
  }, [focus?.mintA, focus?.mintB, earth.pools, earth.launches]);

  useEffect(() => {
    if (marketId?.startsWith("launch:")) {
      const mint = marketId.slice(7);
      const live = earth.launches.find((c) => c.mint === mint);
      if (live && !live.graduated) return;
      if (live?.graduated && live.poolId) {
        setMarketId(live.poolId);
        return;
      }
    }
    if (marketId && earth.pools.some((p) => p.id === marketId)) return;
    const firstLaunch = earth.launches.find((c) => !c.graduated);
    setMarketId(earth.pools[0]?.id ?? (firstLaunch ? launchMarketId(firstLaunch.mint) : undefined));
  }, [earth.pools, earth.launches, marketId]);

  const launchMint = marketId?.startsWith("launch:") ? marketId.slice(7) : undefined;
  const launch = launchMint ? earth.launches.find((c) => c.mint === launchMint && !c.graduated) : undefined;
  const pool = launch ? undefined : earth.pools.find((p) => p.id === marketId);
  const sol = findToken(WSOL, earth.tokens);
  const launchToken = launch ? findToken(launch.mint, earth.tokens) : undefined;
  const nativeBase = launch ? launchToken : pool ? findToken(pool.tokenA, earth.tokens) : undefined;
  const nativeQuote = launch ? sol : pool ? findToken(pool.tokenB, earth.tokens) : undefined;
  const base = flipped && !launch ? nativeQuote : nativeBase;
  const quote = flipped && !launch ? nativeBase : nativeQuote;

  const last = launch && launchToken
    ? spotSolPerToken(BigInt(launch.virtualSol), BigInt(launch.virtualTokens), launchToken.decimals)
    : pool && base && quote
      ? spotPrice(pool, base.mint, quote.mint, earth.tokens)
      : 0;

  const nativeSeries = useMemo(() => {
    if (launch && last > 0) return candlesForId(launchMarketId(launch.mint), last, timeframe);
    if (!pool) return [];
    return nativeCandles(pool, earth.tokens, timeframe);
  }, [launch, last, pool, earth.tokens, timeframe, earth.pools, earth.launches, tick]);
  const candles = useMemo(
    () => (flipped && !launch ? invertCandles(nativeSeries) : nativeSeries),
    [flipped, launch, nativeSeries],
  );
  const stats = useMemo(() => statsFromCandles(candles, last), [candles, last]);
  const depth = useMemo(
    () => (pool && base && quote ? ammDepth(pool, base.mint, quote.mint, earth.tokens) : { bids: [], asks: [] }),
    [pool, base, quote, earth.tokens, earth.pools],
  );
  const tape = useMemo(
    () =>
      nativeBase && nativeQuote
        ? fillsForPair(pool ?? { id: launch ? launchMarketId(launch.mint) : marketId }, nativeBase, nativeQuote)
        : [],
    [pool, launch, marketId, nativeBase, nativeQuote, tick],
  );

  const pay = side === "buy" ? quote : base;
  const receive = side === "buy" ? base : quote;
  const amountIn = useMemo(
    () => (pay ? parseAmount(rawIn || "0", pay.decimals) : 0n),
    [rawIn, pay],
  );

  const earthQuotes = useMemo(() => {
    if (launch || !pay || !receive) return [];
    return quoteEarthRoutes(earth.pools, earth.tokens, pay.mint, receive.mint, amountIn);
  }, [launch, earth.pools, earth.tokens, pay, receive, amountIn]);

  const launchQuote = useMemo((): CurveQuote | undefined => {
    if (!launch || amountIn <= 0n) return undefined;
    const state = {
      virtualSol: BigInt(launch.virtualSol),
      virtualTokens: BigInt(launch.virtualTokens),
      realSolRaised: BigInt(launch.realSolRaised),
      tokensSold: BigInt(launch.tokensSold),
      graduationSol: BigInt(launch.graduationSol),
      feeBps: launch.feeBps,
    };
    try {
      return side === "buy" ? quoteBuy(state, amountIn) : quoteSell(state, amountIn);
    } catch {
      return undefined;
    }
  }, [launch, amountIn, side]);

  const routes = earthQuotes;
  useEffect(() => {
    setPicked(pickBest(earthQuotes)?.id);
  }, [earthQuotes]);

  const selected = routes.find((r) => r.id === picked) ?? routes[0];
  const outPreview = launch
    ? launchQuote && receive
      ? formatAmount(launchQuote.amountOut, receive.decimals)
      : "0"
    : selected && receive
      ? formatAmount(BigInt(selected.amountOut), receive.decimals)
      : "0";
  const launchBal = launch ? (side === "buy" ? earth.balances.get(WSOL) : launchHolding(earth, launch.mint)) : undefined;
  const inBal = launch ? launchBal : pay ? earth.balances.get(pay.mint) : undefined;
  const inUsd = pay ? amountUsd(amountIn, pay, feed.markets.get(pay.mint), feed.solUsd) : 0;
  const outUsd =
    launch && launchQuote && receive
      ? amountUsd(launchQuote.amountOut, receive, feed.markets.get(receive.mint), feed.solUsd)
      : selected && receive
        ? amountUsd(BigInt(selected.amountOut), receive, feed.markets.get(receive.mint), feed.solUsd)
        : 0;
  const lastUsd = base ? amountUsd(parseAmount("1", base.decimals), base, feed.markets.get(base.mint), feed.solUsd) : 0;
  const tvl =
    pool && nativeBase && nativeQuote
      ? amountUsd(BigInt(pool.reserveA), nativeBase, feed.markets.get(nativeBase.mint), feed.solUsd) +
        amountUsd(BigInt(pool.reserveB), nativeQuote, feed.markets.get(nativeQuote.mint), feed.solUsd)
      : 0;
  const launchPct = launch ? progressBps(BigInt(launch.realSolRaised), BigInt(launch.graduationSol)) / 100 : 0;

  const markets = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const earthRows = earth.pools
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
        return {
          id: row.id,
          kind: "pool" as const,
          pool: row,
          base: a,
          quote: b,
          price,
          changePct: st.changePct,
          tvl: usd,
          volume: st.volume,
          venue: row.venue.replace("earth-", ""),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const launchRows = earth.launches
      .filter((c) => !c.graduated)
      .map((coin) => {
        const a = findToken(coin.mint, earth.tokens);
        const b = findToken(WSOL, earth.tokens);
        if (!a || !b) return null;
        const price = spotSolPerToken(BigInt(coin.virtualSol), BigInt(coin.virtualTokens), a.decimals);
        const label = `${a.symbol}/${b.symbol}`.toLowerCase();
        if (needle && !label.includes(needle) && !a.name.toLowerCase().includes(needle)) return null;
        return {
          id: launchMarketId(coin.mint),
          kind: "launch" as const,
          pool: undefined,
          base: a,
          quote: b,
          price,
          changePct: 0,
          tvl: Number(BigInt(coin.realSolRaised)) / 1e9,
          volume: 0,
          venue: "launch",
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    return [...launchRows, ...earthRows].sort((a, b) => b.tvl - a.tvl);
  }, [earth.pools, earth.launches, earth.tokens, feed.markets, feed.solUsd, q, tick]);

  const unpooled = useMemo(() => {
    const pooled = new Set(earth.pools.flatMap((p) => [p.tokenA, p.tokenB]));
    const launching = new Set(earth.launches.filter((c) => !c.graduated).map((c) => c.mint));
    return earth.tokens.filter((t) => !pooled.has(t.mint) && !launching.has(t.mint) && t.mint !== WSOL);
  }, [earth.pools, earth.launches, earth.tokens]);

  const maxAsk = Math.max(...depth.asks.map((d) => d.total), 1);
  const maxBid = Math.max(...depth.bids.map((d) => d.total), 1);
  const hasMarket = Boolean((pool || launch) && base && quote);
  const canFill = launch ? Boolean(launchQuote) : Boolean(selected);

  function setPct(pct: number) {
    if (!pay || inBal === undefined) return;
    const slice = (inBal * BigInt(pct)) / 100n;
    setRawIn(formatAmount(slice, pay.decimals));
  }

  async function execute() {
    if (!base || !quote) return;
    if (!earth.wallet) {
      setMessage("Connect Earth Wallet to trade.");
      return;
    }
    setBusy(true);
    try {
      if (launch) {
        const result = await earth.tradeLaunch(launch.mint, side, rawIn);
        if (result.coin.graduated) {
          setMessage(`${base.symbol} graduated. It now trades as an Earth pool.`);
          if (result.coin.poolId) setMarketId(result.coin.poolId);
        } else {
          setMessage(`Filled ${side} ${base.symbol}/SOL on the launch curve.`);
        }
      } else {
        if (!selected) return;
        await earth.executeRoute(selected);
        setMessage(`Filled ${side} ${base.symbol}/${quote.symbol} on ${selected.venue}.`);
      }
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
          <span>{markets.length} pairs</span>
        </div>
        <input
          className="search-field"
          placeholder="Search pools and launchpad"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="market-list">
          {markets.map((row) => {
            const active = row.id === marketId;
            const up = row.changePct >= 0;
            return (
              <button
                key={row.id}
                type="button"
                className={`market-row${active ? " active" : ""}`}
                onClick={() => {
                  setMarketId(row.id);
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
                  <div className="muted">{row.venue}</div>
                </span>
                <span className="market-px">
                  <b className="mono">{formatPrice(row.price)}</b>
                  <div className={row.kind === "launch" ? "muted" : up ? "up" : "down"}>
                    {row.kind === "launch" ? "curve" : formatPct(row.changePct)}
                  </div>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="ghost wide" style={{ margin: "10px 12px 0" }} onClick={onOpenLaunchpad}>
          Launchpad
        </button>
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
        {hasMarket && base && quote ? (
          <>
            <header className="panel pad term-ticker">
              <button
                type="button"
                className="pair-flip"
                onClick={() => {
                  if (!launch) setFlipped((v) => !v);
                }}
              >
                <span className="pair-marks">
                  <TokenAvatar symbol={base.symbol} size={32} />
                  <TokenAvatar symbol={quote.symbol} size={32} />
                </span>
                <span>
                  <strong>
                    {base.symbol}/{quote.symbol}
                  </strong>
                  <div className="muted">
                    {launch
                      ? `Launchpad · ${bpsLabel(launch.feeBps)} fee · ${launchPct.toFixed(1)}% to graduation`
                      : pool
                        ? `${pool.venue} · ${bpsLabel(pool.feeBps)} fee · flip pair`
                        : ""}
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
                  <span>{launch ? "Raised" : "24h vol"}</span>
                  <strong className="mono">
                    {launch
                      ? `${formatUsdish(Number(BigInt(launch.realSolRaised)) / 1e9)} SOL`
                      : formatUsdish(stats.volume)}
                  </strong>
                </div>
                <div>
                  <span>{launch ? "Target" : "TVL"}</span>
                  <strong className="mono">
                    {launch
                      ? `${formatUsdish(Number(BigInt(launch.graduationSol)) / 1e9)} SOL`
                      : tvl > 0
                        ? `$${formatUsdish(tvl)}`
                        : "—"}
                  </strong>
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
                <span className="muted chart-note">
                  {launch ? "Launchpad curve vs SOL" : "Earth AMM series from pool reserves"}
                </span>
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
                  <span>{launch ? "Curve" : "Depth"}</span>
                  <span>{launch ? "graduation" : "AMM curve"}</span>
                </div>
                {launch ? (
                  <div className="stack">
                    <div className="launch-meter tall" aria-label={`${launchPct.toFixed(1)} percent to graduation`}>
                      <span style={{ width: `${Math.min(100, launchPct)}%` }} />
                    </div>
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      {launchPct.toFixed(1)}% to graduation. Last buys that fill the target lock remaining tokens and
                      raised SOL into an Earth pool.
                    </p>
                    <button type="button" className="ghost" onClick={onOpenLaunchpad}>
                      Coin desk on Launchpad
                    </button>
                  </div>
                ) : (
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
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="panel pad">
            <div className="panel-head">
              <span>No market yet</span>
            </div>
            <p className="lede">
              Trade lists Earth pools and launchpad coins on the curve. Launch a coin, or create a pool under Liquidity.
            </p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={onOpenLaunchpad}>
                Open Launchpad
              </button>
              <button type="button" className="ghost" onClick={() => onAddLiquidity({ mintA: WSOL })}>
                Create a pool
              </button>
            </div>
          </div>
        )}
      </section>

      <aside className="panel pad term-ticket">
        <div className="panel-head tight">
          <span>Order</span>
          <span>{launch ? "market · launch" : "market · AMM"}</span>
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
          <span className="field-meta">
            {outUsd > 0 ? `~$${formatUsdish(outUsd)}` : launch ? "Launch curve" : selected ? selected.venue : "No route"}
          </span>
        </div>
        <div className="token-row compact">
          <input readOnly value={outPreview} />
          {receive ? <span className="ticket-asset">{receive.symbol}</span> : null}
        </div>
        {launch ? (
          <p className="ticket-meta">
            Launchpad curve · {bpsLabel(launch.feeBps)} fee
            {launchQuote?.graduates ? " · this size graduates the coin" : ""}
          </p>
        ) : selected ? (
          <p className="ticket-meta">
            {selected.venue} · impact {bpsLabel(selected.priceImpactBps)}
            {selected.note ? ` · ${selected.note}` : ""}
          </p>
        ) : (
          <p className="ticket-meta">No Earth pool for this pair. Create one under Liquidity, or pick a launchpad coin.</p>
        )}
        {!launch ? (
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
        ) : null}
        <button
          type="button"
          className={`primary wide ${side === "sell" ? "sell-cta" : "buy-cta"}`}
          disabled={!canFill || busy || amountIn <= 0n || !earth.wallet}
          onClick={() => void execute()}
        >
          {busy ? "Confirm in wallet…" : !earth.wallet ? "Connect wallet" : `${side === "buy" ? "Buy" : "Sell"} ${base?.symbol ?? ""}`}
        </button>
        {message ? <p className="notice" style={{ marginTop: 12 }}>{message}</p> : null}
      </aside>
    </div>
  );
}
