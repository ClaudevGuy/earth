import type { ListedToken } from "../types";
import { WSOL } from "../lib/constants";
import type { IndexedMarket } from "./types";

export function amountUsd(
  amount: bigint,
  token: ListedToken,
  market: IndexedMarket | undefined,
  solUsd: number,
): number {
  const ui = Number(amount) / 10 ** token.decimals;
  if (!Number.isFinite(ui) || ui <= 0) return 0;
  if (token.mint === WSOL && solUsd > 0) return ui * solUsd;
  if (market?.priceUsd) return ui * market.priceUsd;
  if (market && market.usd > 0 && market.supply > 0) return ui * (market.usd / market.supply);
  return 0;
}
