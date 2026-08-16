import type { Pool } from "../types";
import { loadJson, saveJson } from "../lib/storage";
import { WSOL } from "../lib/constants";
import { USDC, USDT, BONK, MERIDIAN } from "../data/tokens";

const SOL = WSOL;

function seedPools(): Pool[] {
  return [
    {
      id: "earth-sol-usdc",
      tokenA: SOL,
      tokenB: USDC,
      reserveA: "2500000000000",
      reserveB: "425000000000",
      lpSupply: "103077640638",
      feeBps: 30,
      curve: "constant-product",
      venue: "earth-cpmm",
    },
    {
      id: "earth-usdc-usdt",
      tokenA: USDC,
      tokenB: USDT,
      reserveA: "8000000000000",
      reserveB: "8012000000000",
      lpSupply: "8005999000000",
      feeBps: 4,
      curve: "stable",
      venue: "earth-stable",
    },
    {
      id: "earth-bonk-sol",
      tokenA: BONK,
      tokenB: SOL,
      reserveA: "85000000000000000",
      reserveB: "420000000000",
      lpSupply: "18894390702000",
      feeBps: 30,
      curve: "constant-product",
      venue: "earth-cpmm",
    },
    {
      id: "earth-mrd-sol",
      tokenA: MERIDIAN,
      tokenB: SOL,
      reserveA: "1000000000000000000000000",
      reserveB: "1500000000000",
      lpSupply: "1224744871391589",
      feeBps: 30,
      curve: "constant-product",
      venue: "earth-cpmm",
    },
  ];
}

export function loadPools(): Pool[] {
  return loadJson<Pool[]>("pools", seedPools());
}

export function savePools(pools: Pool[]): void {
  saveJson("pools", pools);
}

export function resetPools(): Pool[] {
  const next = seedPools();
  savePools(next);
  return next;
}

export function poolPairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function findPool(pools: Pool[], mintA: string, mintB: string): Pool | undefined {
  const key = poolPairKey(mintA, mintB);
  return pools.find((p) => poolPairKey(p.tokenA, p.tokenB) === key);
}

export function findPoolsForPair(pools: Pool[], mintA: string, mintB: string): Pool[] {
  const key = poolPairKey(mintA, mintB);
  return pools.filter((p) => poolPairKey(p.tokenA, p.tokenB) === key);
}
