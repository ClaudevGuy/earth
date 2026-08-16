import type { Pool, RouteQuote } from "../types";
import { applySwap, quotePool } from "./engine";

export function executeEarthRoute(pools: Pool[], route: RouteQuote): Pool[] {
  if (route.executable !== "earth") {
    throw new Error("This venue is quote-only in the preview.");
  }
  let next = pools;
  for (const hop of route.hops) {
    if (!hop.poolId) continue;
    const pool = next.find((p) => p.id === hop.poolId);
    if (!pool) throw new Error("Pool missing");
    const out = quotePool(pool, hop.inMint, BigInt(hop.amountIn));
    const updated = applySwap(pool, hop.inMint, BigInt(hop.amountIn), out);
    next = next.map((p) => (p.id === updated.id ? updated : p));
  }
  return next;
}
