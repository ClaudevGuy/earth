import type { ListedToken, Pool } from "../types";
import { USDC } from "../data/tokens";
import { WSOL } from "../lib/constants";
import type { IndexedMarket } from "./types";

function uiAmount(raw: string, decimals: number): number {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  return Number.isFinite(n) ? n : 0;
}

/** Derive USD prices from Earth pools (SOL/USDC first, then each token vs those). */
export function marketsFromEarthPools(pools: Pool[], tokens: ListedToken[]): IndexedMarket[] {
  const byMint = new Map(tokens.map((t) => [t.mint, t]));
  const sol = byMint.get(WSOL);
  const usdc = byMint.get(USDC);
  if (!sol || !usdc) return [];

  let solUsd = 0;
  for (const pool of pools) {
    const pair = new Set([pool.tokenA, pool.tokenB]);
    if (!pair.has(WSOL) || !pair.has(USDC)) continue;
    const solRes = uiAmount(pool.tokenA === WSOL ? pool.reserveA : pool.reserveB, sol.decimals);
    const usdRes = uiAmount(pool.tokenA === USDC ? pool.reserveA : pool.reserveB, usdc.decimals);
    if (solRes > 0 && usdRes > 0) {
      solUsd = usdRes / solRes;
      break;
    }
  }

  const out = new Map<string, IndexedMarket>();
  if (solUsd > 0) {
    out.set(WSOL, {
      mint: WSOL,
      usd: 0,
      sol: 1,
      priceUsd: solUsd,
      supply: 0,
      complete: true,
      name: sol.name,
      symbol: sol.symbol,
      source: "earth",
    });
    out.set(USDC, {
      mint: USDC,
      usd: 0,
      sol: solUsd > 0 ? 1 / solUsd : 0,
      priceUsd: 1,
      supply: 0,
      complete: true,
      name: usdc.name,
      symbol: usdc.symbol,
      source: "earth",
    });
  }

  for (const pool of pools) {
    for (const [mint, raw, otherMint, otherRaw] of [
      [pool.tokenA, pool.reserveA, pool.tokenB, pool.reserveB],
      [pool.tokenB, pool.reserveB, pool.tokenA, pool.reserveA],
    ] as const) {
      if (out.has(mint) && out.get(mint)?.source === "earth" && (mint === WSOL || mint === USDC)) continue;
      const token = byMint.get(mint);
      const other = byMint.get(otherMint);
      if (!token || !other) continue;
      const selfUi = uiAmount(raw, token.decimals);
      const otherUi = uiAmount(otherRaw, other.decimals);
      if (selfUi <= 0 || otherUi <= 0) continue;
      let priceUsd = 0;
      if (otherMint === USDC) priceUsd = otherUi / selfUi;
      else if (otherMint === WSOL && solUsd > 0) priceUsd = (otherUi / selfUi) * solUsd;
      else {
        const otherPx = out.get(otherMint)?.priceUsd ?? 0;
        if (otherPx > 0) priceUsd = (otherUi / selfUi) * otherPx;
      }
      if (priceUsd <= 0) continue;
      out.set(mint, {
        mint,
        usd: 0,
        sol: solUsd > 0 ? priceUsd / solUsd : 0,
        priceUsd,
        supply: 0,
        complete: true,
        name: token.name,
        symbol: token.symbol,
        source: "earth",
      });
    }
  }

  return [...out.values()];
}

export async function fetchPumpMcaps(mints: string[]): Promise<IndexedMarket[]> {
  const real = mints.filter((m) => m.length >= 32 && !m.startsWith("earth"));
  if (!real.length) return [];
  try {
    const res = await fetch("/api/mcaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mints: real.slice(0, 80) }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      coins?: Array<{ mint: string; usd: number; sol: number; complete?: boolean; name?: string; symbol?: string; missing?: boolean }>;
    };
    return (data.coins ?? [])
      .filter((coin) => !coin.missing && coin.usd > 0)
      .map((coin) => ({
        mint: coin.mint,
        usd: coin.usd,
        sol: coin.sol,
        priceUsd: 0,
        supply: 0,
        complete: Boolean(coin.complete),
        name: coin.name ?? "",
        symbol: coin.symbol ?? "",
        source: "pump" as const,
      }));
  } catch {
    return [];
  }
}

export function solUsdFromMarkets(markets: Iterable<IndexedMarket>): number {
  for (const row of markets) {
    if (row.mint === WSOL && row.priceUsd > 0) return row.priceUsd;
  }
  for (const row of markets) {
    if (row.sol > 0 && row.usd > 0) return row.usd / row.sol;
  }
  return 0;
}
