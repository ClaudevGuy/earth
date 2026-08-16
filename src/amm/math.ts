import { isqrt } from "../lib/amounts";
import type { CurveKind } from "../types";

const FEE_DENOM = 10_000n;

export function afterFee(amountIn: bigint, feeBps: number): bigint {
  const bps = BigInt(feeBps);
  return (amountIn * (FEE_DENOM - bps)) / FEE_DENOM;
}

export function quoteConstantProduct(reserveIn: bigint, reserveOut: bigint, amountIn: bigint, feeBps: number): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) return 0n;
  const dx = afterFee(amountIn, feeBps);
  return (reserveOut * dx) / (reserveIn + dx);
}

/** Near-1:1 curve for like-assets. Caps output at 95% of reserve. */
export function quoteStable(reserveIn: bigint, reserveOut: bigint, amountIn: bigint, feeBps: number): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) return 0n;
  const dx = afterFee(amountIn, feeBps);
  const ideal = dx;
  const cap = (reserveOut * 95n) / 100n;
  const stretched = (ideal * reserveOut) / (reserveOut + ideal / 50n);
  const out = stretched < ideal ? stretched : ideal;
  return out < cap ? out : cap;
}

export function quoteSwap(
  curve: CurveKind,
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps: number,
): bigint {
  return curve === "stable"
    ? quoteStable(reserveIn, reserveOut, amountIn, feeBps)
    : quoteConstantProduct(reserveIn, reserveOut, amountIn, feeBps);
}

export function priceImpactBps(reserveIn: bigint, reserveOut: bigint, amountIn: bigint, amountOut: bigint): number {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n || amountOut <= 0n) return 0;
  const spot = Number(reserveOut) / Number(reserveIn);
  const exec = Number(amountOut) / Number(amountIn);
  if (!Number.isFinite(spot) || !Number.isFinite(exec) || spot === 0) return 0;
  return Math.max(0, Math.round((1 - exec / spot) * 10_000));
}

export function initialLpShares(amountA: bigint, amountB: bigint): bigint {
  return isqrt(amountA * amountB);
}

export function lpSharesForDeposit(amountA: bigint, reserveA: bigint, supply: bigint): bigint {
  if (reserveA === 0n || supply === 0n) return 0n;
  return (amountA * supply) / reserveA;
}

export function withdrawAmounts(shares: bigint, supply: bigint, reserveA: bigint, reserveB: bigint): {
  amountA: bigint;
  amountB: bigint;
} {
  if (supply <= 0n || shares <= 0n) return { amountA: 0n, amountB: 0n };
  return {
    amountA: (shares * reserveA) / supply,
    amountB: (shares * reserveB) / supply,
  };
}
