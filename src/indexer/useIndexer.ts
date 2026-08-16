import { useEffect, useMemo, useState } from "react";
import type { ListedToken, Pool } from "../types";
import { fetchPumpMcaps, marketsFromEarthPools, solUsdFromMarkets } from "./client";
import type { IndexedMarket, IndexerStatus } from "./types";

export function useIndexer(tokens: ListedToken[], pools: Pool[]) {
  const [remote, setRemote] = useState<IndexedMarket[]>([]);
  const local = useMemo(() => marketsFromEarthPools(pools, tokens), [pools, tokens]);
  const mints = useMemo(() => tokens.map((t) => t.mint), [tokens]);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const extra = await fetchPumpMcaps(mints);
      if (!cancelled) setRemote(extra);
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mints.join(",")]);

  const markets = useMemo(() => {
    const map = new Map<string, IndexedMarket>();
    for (const row of remote) map.set(row.mint, row);
    for (const row of local) {
      const prev = map.get(row.mint);
      if (!prev || prev.priceUsd <= 0) map.set(row.mint, row);
    }
    return map;
  }, [local, remote]);

  const status: IndexerStatus = remote.length ? "live" : "local";
  const solUsd = useMemo(() => solUsdFromMarkets(markets.values()), [markets]);

  return { markets, status, solUsd };
}

export type IndexerFeed = ReturnType<typeof useIndexer>;
