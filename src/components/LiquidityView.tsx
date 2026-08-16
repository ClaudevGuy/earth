import { useEffect, useMemo, useState } from "react";
import type { EarthState } from "../useEarth";
import type { CurveKind, ListedToken, PairFocus } from "../types";
import { TokenSelect } from "./TokenSelect.tsx";
import { formatAmount, parseAmount } from "../lib/amounts.ts";
import { findPool } from "../amm/pools.ts";
import { findToken } from "../data/tokens.ts";
import { findStandard } from "../adapters/registry.ts";
import { WSOL } from "../lib/constants.ts";

export function LiquidityView({
  earth,
  focus,
}: {
  earth: EarthState;
  focus?: PairFocus;
}) {
  const sol = earth.tokens.find((t) => t.mint === WSOL) ?? earth.tokens[0]!;
  const usdc = earth.tokens.find((t) => t.symbol === "USDC") ?? earth.tokens[1] ?? sol;
  const [tokenA, setTokenA] = useState<ListedToken>(sol);
  const [tokenB, setTokenB] = useState<ListedToken>(usdc);
  const [rawA, setRawA] = useState("10");
  const [rawB, setRawB] = useState("1700");
  const [curve, setCurve] = useState<CurveKind>("constant-product");
  const [feeBps, setFeeBps] = useState("30");
  const [note, setNote] = useState<string>();

  useEffect(() => {
    if (!focus?.mintA) return;
    const a = earth.tokens.find((t) => t.mint === focus.mintA);
    const b = earth.tokens.find((t) => t.mint === (focus.mintB ?? WSOL));
    if (a) setTokenA(a);
    if (b && b.mint !== a?.mint) setTokenB(b);
  }, [focus?.mintA, focus?.mintB, earth.tokens]);

  const existing = findPool(earth.pools, tokenA.mint, tokenB.mint);
  const position = earth.positions.find((p) => p.poolId === existing?.id);
  const stdA = findStandard(tokenA.standardId, earth.standards);
  const stdB = findStandard(tokenB.standardId, earth.standards);

  const amountA = useMemo(() => parseAmount(rawA || "0", tokenA.decimals), [rawA, tokenA.decimals]);
  const amountB = useMemo(() => parseAmount(rawB || "0", tokenB.decimals), [rawB, tokenB.decimals]);

  function deposit() {
    setNote(undefined);
    try {
      if (!existing) {
        earth.createPairPool({
          tokenA,
          tokenB,
          amountA,
          amountB,
          curve,
          feeBps: Number(feeBps) || 30,
        });
        setNote(`Created ${tokenA.symbol}/${tokenB.symbol} (${stdA?.name ?? "?"} × ${stdB?.name ?? "?"}).`);
        return;
      }
      const orderedA = existing.tokenA === tokenA.mint ? amountA : amountB;
      const orderedB = existing.tokenA === tokenA.mint ? amountB : amountA;
      const shares = earth.depositToPool(existing.id, orderedA, orderedB);
      setNote(`Added liquidity. LP shares +${shares.toString()}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not add liquidity.");
    }
  }

  function withdraw() {
    setNote(undefined);
    try {
      if (!existing) throw new Error("No pool for this pair.");
      const { amountA: outA, amountB: outB } = earth.withdrawFromPool(existing.id);
      const ta = findToken(existing.tokenA, earth.tokens);
      const tb = findToken(existing.tokenB, earth.tokens);
      setNote(
        `Withdrew ${ta ? formatAmount(outA, ta.decimals) : outA} ${ta?.symbol} and ${tb ? formatAmount(outB, tb.decimals) : outB} ${tb?.symbol}.`,
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not withdraw.");
    }
  }

  return (
    <div className="swap-grid">
      <section className="panel pad stack">
        <div className="panel-head">
          <span>Provide liquidity</span>
          <span>{existing ? "Existing pool" : "New pool"}</span>
        </div>
        <p className="notice">
          Any registered standard can be pooled, including custom u128 adapters. Pair two listed tokens and seed
          reserves.
        </p>
        <label>
          Token A · {stdA?.name ?? "unknown standard"}
          <div className="token-row">
            <input value={rawA} onChange={(e) => setRawA(e.target.value)} />
            <TokenSelect tokens={earth.tokens} standards={earth.standards} value={tokenA} onChange={setTokenA} />
          </div>
        </label>
        <label>
          Token B · {stdB?.name ?? "unknown standard"}
          <div className="token-row">
            <input value={rawB} onChange={(e) => setRawB(e.target.value)} />
            <TokenSelect tokens={earth.tokens} standards={earth.standards} value={tokenB} onChange={setTokenB} />
          </div>
        </label>
        {!existing ? (
          <div className="form-grid">
            <label>
              Curve
              <select value={curve} onChange={(e) => setCurve(e.target.value as CurveKind)}>
                <option value="constant-product">Constant product</option>
                <option value="stable">Stable</option>
              </select>
            </label>
            <label>
              Fee (bps)
              <input value={feeBps} onChange={(e) => setFeeBps(e.target.value)} />
            </label>
          </div>
        ) : null}
        <div className="row-actions">
          <button type="button" className="primary" onClick={deposit}>
            {existing ? "Add liquidity" : "Create pool"}
          </button>
          <button type="button" className="ghost" onClick={withdraw} disabled={!position}>
            Withdraw LP
          </button>
        </div>
        {note ? <p className={note.startsWith("Created") || note.startsWith("Added") || note.startsWith("Withdrew") ? "notice" : "notice alert"}>{note}</p> : null}
      </section>
      <aside className="panel pad">
        <div className="panel-head">
          <span>Pair notes</span>
        </div>
        <p className="notice">
          {stdA?.amountWidth === "u128" || stdB?.amountWidth === "u128"
            ? "This pair uses a u128 adapter. Earth can pool it; Phantom and Jupiter will not see it until they add the same adapter."
            : "Both sides are u64. If they are SPL / Token-2022, Jupiter can quote them when an API key is set."}
        </p>
        {position && existing ? (
          <p className="notice" style={{ marginTop: 12 }}>
            Your LP shares: <span className="mono">{position.shares}</span>
          </p>
        ) : (
          <p className="notice" style={{ marginTop: 12 }}>
            No LP shares on this pair yet.
          </p>
        )}
      </aside>
    </div>
  );
}
