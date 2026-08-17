import type { Pool } from "../types";
import { loadJson, saveJson } from "../lib/storage";

const DEMO_POOL_IDS = new Set(["earth-sol-usdc", "earth-usdc-usdt", "earth-bonk-sol", "earth-mrd-sol"]);

export function loadPools(): Pool[] {
  return loadJson<Pool[]>("pools", []).filter((p) => !DEMO_POOL_IDS.has(p.id));
}

export function savePools(pools: Pool[]): void {
  saveJson(
    "pools",
    pools.filter((p) => !DEMO_POOL_IDS.has(p.id)),
  );
}

export function mergeMarketPools(local: Pool[], remote: Pool[]): Pool[] {
  const seen = new Set<string>();
  const out: Pool[] = [];
  for (const row of [...remote, ...local]) {
    if (!row?.id || DEMO_POOL_IDS.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
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
