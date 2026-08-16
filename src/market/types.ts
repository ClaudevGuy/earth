export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Fill {
  id: string;
  time: number;
  poolId?: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  amountOut: string;
  venue: string;
  live?: boolean;
}

export interface DepthLevel {
  price: number;
  size: number;
  total: number;
}

export interface PairStats {
  last: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  volume: number;
}

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D"];

export const INTERVAL_SEC: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14_400,
  "1D": 86_400,
};

export const CANDLE_COUNT: Record<Timeframe, number> = {
  "1m": 240,
  "5m": 288,
  "15m": 192,
  "1h": 168,
  "4h": 180,
  "1D": 90,
};
