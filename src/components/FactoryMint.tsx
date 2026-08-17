import { useMemo, useState } from "react";
import type { EarthState } from "../useEarth";
import type { PairFocus } from "../types";
import { FACTORIES, defaultVariableValues, findFactory } from "../standards/factories";
import { parseMintConfig, fillAgentDefaults } from "../standards/validate";
import { WSOL } from "../lib/constants";
import { USDC } from "../data/tokens";
import { MintVariables } from "./MintVariables";

export function FactoryMint({
  earth,
  onOpenPair,
  onDone,
  onError,
}: {
  earth: EarthState;
  onOpenPair: (page: "swap" | "liquidity" | "trade", focus: PairFocus) => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [picked, setPicked] = useState(FACTORIES[0]?.standard.id ?? "TSxxx1");
  const factory = findFactory(picked) ?? FACTORIES[0]!;
  const [symbol, setSymbol] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [decimals, setDecimals] = useState(String(factory.defaultDecimals));
  const [vars, setVars] = useState<Record<string, string>>(() => defaultVariableValues(factory));
  const [makePool, setMakePool] = useState(false);
  const [quoteMint, setQuoteMint] = useState(WSOL);
  const [amountBase, setAmountBase] = useState("1000000");
  const [amountQuote, setAmountQuote] = useState("10");
  const [busy, setBusy] = useState(false);

  const quotes = useMemo(
    () => earth.tokens.filter((t) => t.mint === WSOL || t.mint === USDC),
    [earth.tokens],
  );

  function pick(id: string) {
    const next = findFactory(id);
    if (!next) return;
    setPicked(id);
    setDecimals(String(next.defaultDecimals));
    setVars(defaultVariableValues(next));
    setMakePool(false);
  }

  function createContract() {
    onError("");
    setBusy(true);
    try {
      const config = parseMintConfig(factory, fillAgentDefaults(vars, earth.wallet));
      const { token, pool } = earth.addTokenToStandard(factory.standard.id, {
        symbol,
        name: tokenName,
        decimals: Number(decimals),
        config,
        createPool: makePool,
        quoteMint,
        amountBase,
        amountQuote,
        curve: "constant-product",
        feeBps: 30,
      });
      if (pool) {
        onOpenPair("trade", { mintA: token.mint, mintB: quoteMint });
        return;
      }
      onDone(
        `${token.symbol} is live on ${factory.standard.name} (${factory.standard.id}). Earth already deployed this factory — you only set the contract variables.`,
      );
      setSymbol("");
      setTokenName("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the contract.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="swap-grid">
      <aside className="panel pad stack">
        <div className="panel-head">
          <span>Pick a factory</span>
        </div>
        <p className="notice">
          These five programs are Earth-built. For an AI-agent token, click <strong>Mandate</strong> (TSxxx5) — that
          card is first. Do not use Launchpad. Do not use Create a standard. There is no Launch curve factory.
        </p>
        <div className="factory-grid">
          {FACTORIES.map((row) => (
            <button
              key={row.standard.id}
              type="button"
              className={`factory-card${picked === row.standard.id ? " active" : ""}`}
              onClick={() => pick(row.standard.id)}
            >
              <strong>{row.standard.name}</strong>
              <span className="mono">{row.standard.id}</span>
              <span>{row.blurb}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="panel pad stack">
        <div className="panel-head">
          <span>New contract on {factory.standard.name}</span>
          <span className="pill">{factory.standard.amountWidth}</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13, letterSpacing: 0, textTransform: "none" }}>
          {factory.blurb}
        </p>
        <div className="form-grid">
          <label>
            Ticker
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="DOGE" />
          </label>
          <label>
            Decimals
            <input value={decimals} onChange={(e) => setDecimals(e.target.value)} />
          </label>
        </div>
        <label>
          Token name
          <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Optional display name" />
        </label>
        <MintVariables factory={factory} values={vars} onChange={(key, value) => setVars((prev) => ({ ...prev, [key]: value }))} />
        <label className="check-row">
          <input type="checkbox" checked={makePool} onChange={(e) => setMakePool(e.target.checked)} />
          Create a pool now
        </label>
        {makePool ? (
          <div className="form-grid">
            <label>
              Quote
              <select value={quoteMint} onChange={(e) => setQuoteMint(e.target.value)}>
                {quotes.map((t) => (
                  <option key={t.mint} value={t.mint}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Your token amount
              <input value={amountBase} onChange={(e) => setAmountBase(e.target.value)} />
            </label>
            <label>
              Quote amount
              <input value={amountQuote} onChange={(e) => setAmountQuote(e.target.value)} />
            </label>
          </div>
        ) : null}
        <button type="button" className="primary" onClick={createContract} disabled={busy}>
          Create contract
        </button>
      </section>
    </div>
  );
}
