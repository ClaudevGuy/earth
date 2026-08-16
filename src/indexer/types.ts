export interface IndexedMarket {
  mint: string;
  usd: number;
  sol: number;
  priceUsd: number;
  supply: number;
  complete: boolean;
  name: string;
  symbol: string;
  source: "earth" | "pump";
}

export type IndexerStatus = "live" | "local";
