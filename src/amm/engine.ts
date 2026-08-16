import type { Pool } from "../types";
import { quoteSwap, initialLpShares, lpSharesForDeposit, withdrawAmounts } from "./math";

export function applySwap(pool: Pool, inputMint: string, amountIn: bigint, amountOut: bigint): Pool {
  const aIn = pool.tokenA === inputMint;
  const reserveA = BigInt(pool.reserveA);
  const reserveB = BigInt(pool.reserveB);
  return {
    ...pool,
    reserveA: (aIn ? reserveA + amountIn : reserveA - amountOut).toString(),
    reserveB: (aIn ? reserveB - amountOut : reserveB + amountIn).toString(),
  };
}

export function quotePool(pool: Pool, inputMint: string, amountIn: bigint): bigint {
  const aIn = pool.tokenA === inputMint;
  const reserveIn = BigInt(aIn ? pool.reserveA : pool.reserveB);
  const reserveOut = BigInt(aIn ? pool.reserveB : pool.reserveA);
  return quoteSwap(pool.curve, reserveIn, reserveOut, amountIn, pool.feeBps);
}

export function applyDeposit(pool: Pool, amountA: bigint, amountB: bigint): { pool: Pool; shares: bigint } {
  const reserveA = BigInt(pool.reserveA);
  const reserveB = BigInt(pool.reserveB);
  const supply = BigInt(pool.lpSupply);
  const shares = supply === 0n ? initialLpShares(amountA, amountB) : lpSharesForDeposit(amountA, reserveA, supply);
  return {
    shares,
    pool: {
      ...pool,
      reserveA: (reserveA + amountA).toString(),
      reserveB: (reserveB + amountB).toString(),
      lpSupply: (supply + shares).toString(),
    },
  };
}

export function applyWithdraw(pool: Pool, shares: bigint): { pool: Pool; amountA: bigint; amountB: bigint } {
  const reserveA = BigInt(pool.reserveA);
  const reserveB = BigInt(pool.reserveB);
  const supply = BigInt(pool.lpSupply);
  const out = withdrawAmounts(shares, supply, reserveA, reserveB);
  return {
    amountA: out.amountA,
    amountB: out.amountB,
    pool: {
      ...pool,
      reserveA: (reserveA - out.amountA).toString(),
      reserveB: (reserveB - out.amountB).toString(),
      lpSupply: (supply - shares).toString(),
    },
  };
}

export function createPool(input: {
  tokenA: string;
  tokenB: string;
  amountA: bigint;
  amountB: bigint;
  curve: Pool["curve"];
  feeBps: number;
}): Pool {
  const shares = initialLpShares(input.amountA, input.amountB);
  const venue = input.curve === "stable" ? "earth-stable" : "earth-cpmm";
  return {
    id: `earth-${Date.now().toString(36)}`,
    tokenA: input.tokenA,
    tokenB: input.tokenB,
    reserveA: input.amountA.toString(),
    reserveB: input.amountB.toString(),
    lpSupply: shares.toString(),
    feeBps: input.feeBps,
    curve: input.curve,
    venue,
  };
}
