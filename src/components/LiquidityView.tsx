import { useEffect, useMemo, useState } from "react";
import type { EarthState } from "../useEarth";
import type { CurveKind, ListedToken, PairFocus } from "../types";
import { TokenSelect } from "./TokenSelect.tsx";
import { parseAmount } from "../lib/amounts.ts";
import { findPool } from "../amm/pools.ts";
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
  const [busy, setBusy] = useState(false);

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

  async function deposit() {
    setNote(undefined);
    setBusy(true);
    try {
      if (!earth.wallet) throw new Error("Connect Earth Wallet to deposit real tokens.");
      if (!existing) {
        await earth.createPairPool({
          tokenA,
          tokenB,
          amountA,
          amountB,
          curve,
          feeBps: Number(feeBps) || 30,
        });
        setNote(`Created ${tokenA.symbol}/${tokenB.symbol} (${stdA?.name ?? "?"} × ${stdB?.name ?? "?"}). Tokens moved into the Earth pool vault.`);
        return;
      }
      const orderedA = existing.tokenA === tokenA.mint ? amountA : amountB;
      const orderedB = existing.tokenA === tokenA.mint ? amountB : amountA;
      await earth.depositToPool(existing.id, orderedA, orderedB);
      setNote(`Added liquidity to ${tokenA.symbol}/${tokenB.symbol}.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not add liquidity.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setNote(undefined);
    setBusy(true);
    try {
      if (!existing) throw new Error("No pool for this pair.");
      await earth.withdrawFromPool(existing.id);
      setNote(`Withdrew LP from ${tokenA.symbol}/${tokenB.symbol}.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not withdraw.");
    } finally {
      setBusy(false);
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
          Pair two listed tokens. Deposits move the tokens into an Earth pool vault. Swaps settle on-chain through that
          vault. Until a pair has an Earth pool, it does not trade on Earth.
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
          <button type="button" className="primary" onClick={() => void deposit()} disabled={busy}>
            {busy ? "Confirm in wallet…" : existing ? "Add liquidity" : "Create pool"}
          </button>
          <button type="button" className="ghost" onClick={() => void withdraw()} disabled={!position || busy}>
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
            ? "This pair uses a u128 adapter. Earth can pool it; other wallets will not see it until they add the same adapter."
            : "Both sides are u64. Open an Earth pool to make this pair tradable on the DEX."}
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
