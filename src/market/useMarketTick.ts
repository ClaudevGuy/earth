import { useEffect, useState } from "react";
import { subscribeMarket } from "./bus";

export function useMarketTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeMarket(() => setTick((n) => n + 1)), []);
  return tick;
}
