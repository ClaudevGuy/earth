import type { EarthState } from "../useEarth";
import type { PairFocus } from "../types";
import type { IndexerFeed } from "../indexer/useIndexer.ts";
import { amountUsd } from "../indexer/value.ts";
import { findToken } from "../data/tokens.ts";
import { formatAmount } from "../lib/amounts.ts";
import { bpsLabel, formatUsdish } from "../lib/format.ts";
import { TokenAvatar } from "./TokenAvatar.tsx";
import { SafeBadge } from "./LockAuthorities.tsx";
import { isTokenSafe } from "../lib/tokenSafety.ts";

export function PoolsView({
  earth,
  feed,
  onOpenPair,
}: {
  earth: EarthState;
  feed: IndexerFeed;
  onOpenPair: (focus: PairFocus) => void;
}) {
  return (
    <section className="panel pad">
      <div className="panel-head">
        <span>Earth AMM pools</span>
      </div>
      <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Pair</th>
            <th>Venue</th>
            <th>Reserves</th>
            <th>Indexed USD</th>
            <th>Fee</th>
            <th>Standards</th>
          </tr>
        </thead>
        <tbody>
          {earth.pools.map((pool) => {
            const a = findToken(pool.tokenA, earth.tokens);
            const b = findToken(pool.tokenB, earth.tokens);
            const sa = earth.standards.find((s) => s.id === a?.standardId);
            const sb = earth.standards.find((s) => s.id === b?.standardId);
            const usdA = a
              ? amountUsd(BigInt(pool.reserveA), a, feed.markets.get(a.mint), feed.solUsd)
              : 0;
            const usdB = b
              ? amountUsd(BigInt(pool.reserveB), b, feed.markets.get(b.mint), feed.solUsd)
              : 0;
            const tvl = usdA + usdB;
            return (
              <tr key={pool.id} className="click-row" onClick={() => onOpenPair({ mintA: pool.tokenA, mintB: pool.tokenB })}>
                <td>
                  <div className="pair">
                    <span className="pair-marks">
                      <TokenAvatar symbol={a?.symbol ?? "?"} logo={a?.logo} size={28} />
                      <TokenAvatar symbol={b?.symbol ?? "?"} logo={b?.logo} size={28} />
                    </span>
                    <div>
                      <strong>
                        {a?.symbol ?? "?"} / {b?.symbol ?? "?"}{" "}
                        {a && isTokenSafe(a) ? <SafeBadge token={a} /> : null}
                        {b && isTokenSafe(b) ? <SafeBadge token={b} /> : null}
                      </strong>
                      <div className="mono muted">{pool.id}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="pill">{pool.venue}</span>
                </td>
                <td className="mono">
                  {a ? formatAmount(BigInt(pool.reserveA), a.decimals, 4) : pool.reserveA} {a?.symbol}
                  <div>
                    {b ? formatAmount(BigInt(pool.reserveB), b.decimals, 4) : pool.reserveB} {b?.symbol}
                  </div>
                </td>
                <td className="mono">{tvl > 0 ? `$${formatUsdish(tvl)}` : "—"}</td>
                <td>{bpsLabel(pool.feeBps)}</td>
                <td>
                  {sa?.name} + {sb?.name}
                  {sa?.amountWidth === "u128" || sb?.amountWidth === "u128" ? (
                    <div className="pill warn">u128</div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}
