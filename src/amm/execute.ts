import type { Pool, RouteQuote } from "../types";
import { applySwap } from "./engine";

export function executeEarthRoute(pools: Pool[], route: RouteQuote): Pool[] {
  if (route.executable !== "earth") {
    throw new Error("This venue is quote-only. Pick an Earth pool.");
  }
  let next = pools;
  for (const hop of route.hops) {
    if (!hop.poolId) continue;
    const pool = next.find((p) => p.id === hop.poolId);
    if (!pool) throw new Error("Pool missing");
    const poolIn = BigInt(hop.poolAmountIn ?? hop.amountIn);
    const poolOut = BigInt(hop.poolAmountOut ?? hop.amountOut);
    const updated = applySwap(pool, hop.inMint, poolIn, poolOut);
    next = next.map((p) => (p.id === updated.id ? updated : p));
  }
  return next;
}
