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

function hashStr(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedTape(pool: Pool, base: ListedToken, quote: ListedToken, last: number): Fill[] {
  if (last <= 0) return [];
  const rand = mulberry32(hashStr(`tape:${pool.id}`));
  const now = Date.now();
  const rows: Fill[] = [];
  for (let i = 36; i >= 1; i--) {
    const buy = rand() > 0.48;
    const drift = 1 + (rand() - 0.5) * 0.012;
    const price = last * drift;
    const quoteAmt = (0.2 + rand() * 8) * (pool.curve === "stable" ? 400 : 12);
    const baseAmt = price > 0 ? quoteAmt / price : 0;
    const baseRaw = BigInt(Math.max(1, Math.round(baseAmt * 10 ** Math.min(base.decimals, 8))));
    const quoteRaw = BigInt(Math.max(1, Math.round(quoteAmt * 10 ** Math.min(quote.decimals, 8))));
    rows.push({
      id: `seed-${pool.id}-${i}`,
      time: now - i * (18_000 + Math.floor(rand() * 40_000)),
      poolId: pool.id,
      inMint: buy ? quote.mint : base.mint,
      outMint: buy ? base.mint : quote.mint,
      amountIn: buy ? quoteRaw.toString() : baseRaw.toString(),
      amountOut: buy ? baseRaw.toString() : quoteRaw.toString(),
      venue: pool.venue === "earth-stable" ? "Earth Stable" : "Earth CPMM",
    });
  }
  return rows;
}

export function liveFills(): Fill[] {
  return loadLive();
}

export function fillsForPair(pool: Pool, base: ListedToken, quote: ListedToken, last: number): Fill[] {
  const live = loadLive().filter((row) => {
    if (row.poolId && row.poolId === pool.id) return true;
    const mints = new Set([row.inMint, row.outMint]);
    return mints.has(base.mint) && mints.has(quote.mint);
  });
  const seeded = seedTape(pool, base, quote, last);
  return [...live, ...seeded].sort((a, b) => b.time - a.time).slice(0, 80);
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
