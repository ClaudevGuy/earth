import type { ListedToken, Pool } from "../types";
import { USDC } from "../data/tokens";
import {
  EARTH_DECIMALS,
  EARTH_MINT,
  STANDARD_CREATE_FEE_USD,
  WSOL,
} from "./constants";
import { isOnChainProgramId } from "./ids";

export function isEarthMintConfigured(): boolean {
  return Boolean(EARTH_MINT) && isOnChainProgramId(EARTH_MINT);
}

export function findEarthToken(tokens: ListedToken[]): ListedToken | undefined {
  if (EARTH_MINT) return tokens.find((t) => t.mint === EARTH_MINT);
  return tokens.find((t) => t.symbol === "EARTH");
}

function uiAmount(raw: string, decimals: number): number {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  return Number.isFinite(n) ? n : 0;
}

function poolPriceUsd(mint: string, tokens: ListedToken[], pools: Pool[]): number {
  const byMint = new Map(tokens.map((t) => [t.mint, t]));
  const self = byMint.get(mint);
  const sol = byMint.get(WSOL);
  const usdc = byMint.get(USDC);
  if (!self) return 0;

  let solUsd = 0;
  if (sol && usdc) {
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
  }

  for (const pool of pools) {
    const pair = new Set([pool.tokenA, pool.tokenB]);
    if (!pair.has(mint)) continue;
    const otherMint = pool.tokenA === mint ? pool.tokenB : pool.tokenA;
    const other = byMint.get(otherMint);
    if (!other) continue;
    const selfRaw = pool.tokenA === mint ? pool.reserveA : pool.reserveB;
    const otherRaw = pool.tokenA === otherMint ? pool.reserveA : pool.reserveB;
    const selfUi = uiAmount(selfRaw, self.decimals);
    const otherUi = uiAmount(otherRaw, other.decimals);
    if (selfUi <= 0 || otherUi <= 0) continue;
    if (otherMint === USDC) return otherUi / selfUi;
    if (otherMint === WSOL && solUsd > 0) return (otherUi / selfUi) * solUsd;
  }
  return 0;
}

/** USD per 1 EARTH from Earth pools, or 0 if $EARTH is not listed / not priced yet. */
export function earthUsdPrice(tokens: ListedToken[], pools: Pool[]): number {
  const earth = findEarthToken(tokens);
  if (!earth) return 0;
  return poolPriceUsd(earth.mint, tokens, pools);
}

export interface StandardCreateBurnQuote {
  usd: number;
  ui: number;
  raw: bigint;
  decimals: number;
  priced: boolean;
  mintSet: boolean;
}

/** How much $EARTH must be burned to list a custom token standard. */
export function quoteStandardCreateBurn(tokens: ListedToken[], pools: Pool[]): StandardCreateBurnQuote {
  const earth = findEarthToken(tokens);
  const decimals = earth?.decimals ?? EARTH_DECIMALS;
  const priceUsd = earthUsdPrice(tokens, pools);
  if (priceUsd <= 0) {
    return {
      usd: STANDARD_CREATE_FEE_USD,
      ui: 0,
      raw: 0n,
      decimals,
      priced: false,
      mintSet: isEarthMintConfigured(),
    };
  }
  const factor = 10 ** decimals;
  const raw = BigInt(Math.ceil((STANDARD_CREATE_FEE_USD / priceUsd) * factor));
  return {
    usd: STANDARD_CREATE_FEE_USD,
    ui: Number(raw) / factor,
    raw,
    decimals,
    priced: true,
    mintSet: isEarthMintConfigured(),
  };
}

export function formatEarthUi(ui: number): string {
  if (!Number.isFinite(ui) || ui <= 0) return "—";
  if (ui >= 1000) return ui.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (ui >= 1) return ui.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return ui.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function standardCreateFeeHeadline(quote: StandardCreateBurnQuote): string {
  if (quote.priced) return `≈ ${formatEarthUi(quote.ui)} EARTH`;
  return `$${STANDARD_CREATE_FEE_USD.toLocaleString()} of $EARTH`;
}

export function standardCreateFeeUsdLabel(): string {
  return `$${STANDARD_CREATE_FEE_USD.toLocaleString()} of $EARTH`;
}
