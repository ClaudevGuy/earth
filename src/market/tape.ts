import type { ListedToken, Pool, RouteQuote } from "../types";
import { findToken } from "../data/tokens";
import { makeId } from "../lib/ids";
import { loadJson, saveJson } from "../lib/storage";
import { emitMarket } from "./bus";
import { applyTradeToSeries } from "./series";
import { spotPrice, uiAmount } from "./price";
import type { Fill } from "./types";

function loadLive(): Fill[] {
  return loadJson<Fill[]>("tape", []);
}

function saveLive(rows: Fill[]): void {
  saveJson("tape", rows.slice(0, 240));
}

export function liveFills(): Fill[] {
  return loadLive();
}

export function setLiveFills(rows: Fill[]): void {
  saveLive(rows);
}

export function fillsForPair(pool: Pool | { id?: string }, base: ListedToken, quote: ListedToken): Fill[] {
  const live = loadLive().filter((row) => {
    if (pool.id && row.poolId && row.poolId === pool.id) return true;
    const mints = new Set([row.inMint, row.outMint]);
    return mints.has(base.mint) && mints.has(quote.mint);
  });
  return live.sort((a, b) => b.time - a.time).slice(0, 80);
}

export function recordRouteFill(input: {
  route: RouteQuote;
  tokens: ListedToken[];
  poolsAfter: Pool[];
}): Fill {
  const first = input.route.hops[0];
  const lastHop = input.route.hops[input.route.hops.length - 1];
  const fill: Fill = {
    id: makeId("fill"),
    time: Date.now(),
    poolId: input.route.hops.find((hop) => hop.poolId)?.poolId,
    inMint: first?.inMint ?? "",
    outMint: lastHop?.outMint ?? "",
    amountIn: first?.amountIn ?? "0",
    amountOut: input.route.amountOut,
    venue: input.route.venue,
    live: true,
  };
  saveLive([fill, ...loadLive()]);

  for (const hop of input.route.hops) {
    if (!hop.poolId) continue;
    const pool = input.poolsAfter.find((p) => p.id === hop.poolId);
    const inTok = findToken(hop.inMint, input.tokens);
    const outTok = findToken(hop.outMint, input.tokens);
    if (!pool || !inTok || !outTok) continue;
    const price = spotPrice(pool, pool.tokenA, pool.tokenB, input.tokens);
    const quoteMint = pool.tokenB;
    const quoteTok = hop.inMint === quoteMint ? inTok : hop.outMint === quoteMint ? outTok : undefined;
    const quoteVol = quoteTok
      ? uiAmount(hop.inMint === quoteMint ? hop.amountIn : hop.amountOut, quoteTok.decimals)
      : 0;
    applyTradeToSeries(pool, price, quoteVol, fill.time);
  }

  emitMarket();
  return fill;
}

export function fillSide(fill: Fill, baseMint: string, quoteMint: string): "buy" | "sell" | undefined {
  if (fill.inMint === quoteMint && fill.outMint === baseMint) return "buy";
  if (fill.inMint === baseMint && fill.outMint === quoteMint) return "sell";
  return undefined;
}

export function fillPrice(fill: Fill, base: ListedToken, quote: ListedToken): number {
  const side = fillSide(fill, base.mint, quote.mint);
  if (!side) return 0;
  const baseAmt = uiAmount(side === "buy" ? fill.amountOut : fill.amountIn, base.decimals);
  const quoteAmt = uiAmount(side === "buy" ? fill.amountIn : fill.amountOut, quote.decimals);
  if (baseAmt <= 0) return 0;
  return quoteAmt / baseAmt;
}
