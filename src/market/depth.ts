import type { ListedToken, Pool } from "../types";
import { quoteSwap } from "../amm/math";
import { findToken } from "../data/tokens";
import { uiAmount } from "./price";
import type { DepthLevel } from "./types";

export interface DepthBook {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

function cloneReserves(pool: Pool, baseMint: string): { base: bigint; quote: bigint } {
  const baseIsA = pool.tokenA === baseMint;
  return {
    base: BigInt(baseIsA ? pool.reserveA : pool.reserveB),
    quote: BigInt(baseIsA ? pool.reserveB : pool.reserveA),
  };
}

export function ammDepth(
  pool: Pool,
  baseMint: string,
  quoteMint: string,
  tokens: ListedToken[],
  steps = 14,
): DepthBook {
  const base = findToken(baseMint, tokens);
  const quote = findToken(quoteMint, tokens);
  if (!base || !quote) return { bids: [], asks: [] };

  const start = cloneReserves(pool, baseMint);
  if (start.base <= 0n || start.quote <= 0n) return { bids: [], asks: [] };

  const quoteStep = start.quote / 90n;
  const baseStep = start.base / 90n;
  if (quoteStep <= 0n || baseStep <= 0n) return { bids: [], asks: [] };

  const asks: DepthLevel[] = [];
  let buy = { ...start };
  let bought = 0n;
  for (let i = 0; i < steps; i++) {
    const out = quoteSwap(pool.curve, buy.quote, buy.base, quoteStep, pool.feeBps);
    if (out <= 0n || out >= buy.base) break;
    buy = { quote: buy.quote + quoteStep, base: buy.base - out };
    bought += out;
    const price = uiAmount(buy.quote, quote.decimals) / uiAmount(buy.base, base.decimals);
    asks.push({ price, size: uiAmount(out, base.decimals), total: uiAmount(bought, base.decimals) });
  }

  const bids: DepthLevel[] = [];
  let sell = { ...start };
  let sold = 0n;
  for (let i = 0; i < steps; i++) {
    const out = quoteSwap(pool.curve, sell.base, sell.quote, baseStep, pool.feeBps);
    if (out <= 0n || out >= sell.quote) break;
    sell = { base: sell.base + baseStep, quote: sell.quote - out };
    sold += baseStep;
    const price = uiAmount(sell.quote, quote.decimals) / uiAmount(sell.base, base.decimals);
    bids.push({ price, size: uiAmount(baseStep, base.decimals), total: uiAmount(sold, base.decimals) });
  }

  return { bids, asks };
}
