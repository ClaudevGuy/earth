import type { ListedToken, Pool } from "../types";
import { findToken } from "../data/tokens";

export function uiAmount(raw: string | bigint, decimals: number): number {
  const n = Number(typeof raw === "bigint" ? raw : BigInt(raw)) / 10 ** decimals;
  return Number.isFinite(n) ? n : 0;
}

/** Quote tokens per one base token, from pool reserves. */
export function spotPrice(
  pool: Pool,
  baseMint: string,
  quoteMint: string,
  tokens: ListedToken[],
): number {
  const base = findToken(baseMint, tokens);
  const quote = findToken(quoteMint, tokens);
  if (!base || !quote) return 0;
  const pair = new Set([pool.tokenA, pool.tokenB]);
  if (!pair.has(baseMint) || !pair.has(quoteMint)) return 0;
  const baseRaw = pool.tokenA === baseMint ? pool.reserveA : pool.reserveB;
  const quoteRaw = pool.tokenA === quoteMint ? pool.reserveA : pool.reserveB;
  const baseUi = uiAmount(baseRaw, base.decimals);
  const quoteUi = uiAmount(quoteRaw, quote.decimals);
  if (baseUi <= 0 || quoteUi <= 0) return 0;
  return quoteUi / baseUi;
}

export function invertCandles<T extends { open: number; high: number; low: number; close: number }>(
  rows: T[],
): T[] {
  return rows.map((row) => {
    const open = row.open === 0 ? 0 : 1 / row.open;
    const close = row.close === 0 ? 0 : 1 / row.close;
    const highSrc = row.low === 0 ? 0 : 1 / row.low;
    const lowSrc = row.high === 0 ? 0 : 1 / row.high;
    return { ...row, open, close, high: Math.max(open, close, highSrc), low: Math.min(open, close, lowSrc) };
  });
}
