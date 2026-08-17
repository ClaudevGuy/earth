import type { LaunchpadCoin, LaunchpadHolding, ListedToken, LpPosition, Pool } from "../types";
import type { Fill } from "../market/types";

export interface MarketState {
  rev: number;
  tokens: ListedToken[];
  pools: Pool[];
  launches: LaunchpadCoin[];
  holdings: LaunchpadHolding[];
  lp: Array<LpPosition & { owner: string }>;
  tape: Fill[];
}

export const EMPTY_MARKET: MarketState = {
  rev: 0,
  tokens: [],
  pools: [],
  launches: [],
  holdings: [],
  lp: [],
  tape: [],
};

export async function fetchMarket(): Promise<MarketState> {
  try {
    const res = await fetch("/api/market");
    if (!res.ok) return EMPTY_MARKET;
    const data = (await res.json()) as Partial<MarketState>;
    return {
      rev: Number(data.rev) || 0,
      tokens: Array.isArray(data.tokens) ? data.tokens : [],
      pools: Array.isArray(data.pools) ? data.pools : [],
      launches: Array.isArray(data.launches) ? data.launches : [],
      holdings: Array.isArray(data.holdings) ? data.holdings : [],
      lp: Array.isArray(data.lp) ? data.lp : [],
      tape: Array.isArray(data.tape) ? data.tape : [],
    };
  } catch {
    return EMPTY_MARKET;
  }
}

export async function publishMarket(state: MarketState): Promise<MarketState> {
  const res = await fetch("/api/market", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  const data = (await res.json()) as MarketState & { error?: string };
  if (!res.ok) throw new Error(data.error || "Could not publish the market.");
  return data;
}

export async function settle(action: string, payload: Record<string, unknown>): Promise<{
  transaction?: string;
  ticket?: string;
  vault?: string;
  state?: MarketState;
  error?: string;
}> {
  const res = await fetch("/api/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = (await res.json()) as {
    transaction?: string;
    ticket?: string;
    vault?: string;
    state?: MarketState;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Settlement failed.");
  return data;
}

export function positionsFor(owner: string | undefined, lp: Array<LpPosition & { owner?: string }>): LpPosition[] {
  if (!owner) return [];
  return lp.filter((row) => row.owner === owner);
}
