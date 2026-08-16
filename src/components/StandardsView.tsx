import { useEffect, useMemo, useState } from "react";
import type { EarthState } from "../useEarth";
import type { AmountWidth, CatalogStandard, CurveKind, PairFocus, StandardKind, TokenStandard } from "../types";
import { catalogFromStandard, mergeStandards, shareUrl } from "../adapters/catalog.ts";
import { canRemoveStandard, findStandard, reviewChecks } from "../adapters/registry.ts";
import { shortAddress } from "../lib/format.ts";
import { WSOL } from "../lib/constants.ts";
import { USDC } from "../data/tokens.ts";
import { TokenAvatar } from "./TokenAvatar.tsx";

type Mode = "browse" | "create";
type Filter = "all" | "custom" | "native" | "mine";

export function StandardsView({
  earth,
  onOpenPair,
  focusId,
  adoptCode,
}: {
  earth: EarthState;
  onOpenPair: (page: "swap" | "liquidity" | "trade", focus: PairFocus) => void;
  focusId?: string;
  adoptCode?: string;
}) {
  const [mode, setMode] = useState<Mode>("browse");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shareIn, setShareIn] = useState(adoptCode ?? "");
  const [highlight, setHighlight] = useState(focusId);
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("");
  const [kind, setKind] = useState<StandardKind>("custom");
  const [width, setWidth] = useState<AmountWidth>("u128");
  const [notes, setNotes] = useState("");
  const [publish, setPublish] = useState(true);
  const [listFirst, setListFirst] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [mint, setMint] = useState("");
  const [decimals, setDecimals] = useState("18");
  const [makePool, setMakePool] = useState(true);
  const [quoteMint, setQuoteMint] = useState(WSOL);
  const [amountBase, setAmountBase] = useState("1000000");
  const [amountQuote, setAmountQuote] = useState("10");
  const [curve, setCurve] = useState<CurveKind>("constant-product");
  const [feeBps, setFeeBps] = useState("30");
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [addFor, setAddFor] = useState<string>();
  const [addSymbol, setAddSymbol] = useState("");
  const [addName, setAddName] = useState("");
  const [addMint, setAddMint] = useState("");
  const [addDecimals, setAddDecimals] = useState("9");
  const [busy, setBusy] = useState(false);

  const quotes = useMemo(
    () => earth.tokens.filter((t) => t.mint === WSOL || t.mint === USDC),
    [earth.tokens],
  );

  const visible = useMemo(() => {
    const merged = mergeStandards(earth.standards, earth.catalog);
    const needle = query.trim().toLowerCase();
    return merged
      .filter((std) => {
        if (filter === "custom") return std.kind === "custom";
        if (filter === "native") return std.review === "native";
        if (filter === "mine") return Boolean(std.userCreated);
        return true;
      })
      .filter((std) => {
        if (!needle) return true;
        return (
          std.name.toLowerCase().includes(needle) ||
          std.programId.toLowerCase().includes(needle) ||
          std.notes.toLowerCase().includes(needle) ||
          std.id.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        const rank = (s: TokenStandard) =>
          s.userCreated ? 0 : s.source === "catalog" ? 1 : s.source === "seeded" || s.published ? 2 : 3;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
  }, [earth.catalog, earth.standards, filter, query]);

  useEffect(() => {
    if (!adoptCode) return;
    try {
      const adopted = earth.adoptStandard(adoptCode);
      setHighlight(adopted.id);
      setShareIn("");
      setNote(`Added ${adopted.name}. List your own token on it below.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not adopt that standard.");
    }
    // adopt once from the inbound link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptCode]);

  useEffect(() => {
    if (!highlight) return;
    document.getElementById(`std-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, visible.length]);

  async function launch() {
    setError(undefined);
    setNote(undefined);
    setBusy(true);
    try {
      const result = await earth.launchStandard({
        standardName: name,
        programId,
        amountWidth: width,
        kind,
        notes,
        publish,
        symbol: listFirst ? symbol : "",
        tokenName,
        mint,
        decimals: Number(decimals),
        createPool: listFirst && makePool,
        quoteMint,
        amountBase,
        amountQuote,
        curve,
        feeBps: Number(feeBps) || 30,
      });
      if (result.pool && result.token) {
        onOpenPair("trade", { mintA: result.token.mint, mintB: quoteMint });
        return;
      }
      const where = result.published
        ? "It is in the public catalog — other users can find it and mint on it."
        : "Copy the share link from its card so others can find it (catalog publish did not go through).";
      setNote(
        result.token
          ? `${result.token.symbol} is listed on ${result.standard.name}. ${where}`
          : `${result.standard.name} is ready. Other users can mint their own tokens on this standard. ${where}`,
      );
      setHighlight(result.standard.id);
      setMode("browse");
      setName("");
      setProgramId("");
      setNotes("");
      setSymbol("");
      setTokenName("");
      setMint("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register.");
    } finally {
      setBusy(false);
    }
  }

  function addToken(standardId: string) {
    setError(undefined);
    try {
      const token = earth.addTokenToStandard(standardId, {
        symbol: addSymbol,
        name: addName,
        mint: addMint,
        decimals: Number(addDecimals),
      });
      setAddFor(undefined);
      setAddSymbol("");
      setAddName("");
      setAddMint("");
      setNote(`${token.symbol} listed on this standard. Create a pool from this card when you want a market.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list token.");
    }
  }

  function adoptFromBox() {
    setError(undefined);
    try {
      const adopted = earth.adoptStandard(shareIn);
      setShareIn("");
      setHighlight(adopted.id);
      setNote(`Added ${adopted.name}. Mint your own token on it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that share code.");
    }
  }

  return (
    <div className="stack">
      <div className="std-tabs">
        <button type="button" className={mode === "browse" ? "active" : ""} onClick={() => setMode("browse")}>
          Browse standards
        </button>
        <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>
          Create a standard
        </button>
      </div>

      {error ? <p className="notice alert">{error}</p> : null}
      {note ? <p className="notice">{note}</p> : null}

      {mode === "browse" ? (
        <div className="stack">
          <div className="panel pad stack">
            <div className="panel-head tight">
              <span>Find a standard</span>
              <span className={`pill${earth.catalogStatus === "local" ? " warn" : ""}`}>
                catalog {earth.catalogStatus}
              </span>
            </div>
            <p className="notice">
              A standard is the program. Anyone can list their own ticker on a published standard. Native SPL and
              Token-2022 are always here; custom programs appear when their creator publishes them or shares a link.
            </p>
            <input
              className="search-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, program ID, or notes"
            />
            <div className="std-filters">
              {(
                [
                  ["all", "All"],
                  ["custom", "Custom"],
                  ["native", "Native"],
                  ["mine", "Yours"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Adopt from a share code
                <input
                  value={shareIn}
                  onChange={(e) => setShareIn(e.target.value)}
                  placeholder="Paste a code or open a shared link"
                />
              </label>
              <div className="row-actions" style={{ alignItems: "end" }}>
                <button type="button" className="ghost" onClick={adoptFromBox} disabled={!shareIn.trim()}>
                  Add standard
                </button>
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="notice">No standards match. Create one, or paste a share code.</p>
          ) : null}

          {visible.map((std) => (
            <StandardCard
              key={std.id}
              std={std}
              earth={earth}
              highlight={highlight === std.id}
              addFor={addFor}
              addSymbol={addSymbol}
              addName={addName}
              addMint={addMint}
              addDecimals={addDecimals}
              setAddFor={setAddFor}
              setAddSymbol={setAddSymbol}
              setAddName={setAddName}
              setAddMint={setAddMint}
              setAddDecimals={setAddDecimals}
              onAddToken={addToken}
              onOpenPair={onOpenPair}
              onCopied={(msg) => {
                setError(undefined);
                setNote(msg);
              }}
              onError={setError}
            />
          ))}
        </div>
      ) : (
        <div className="swap-grid">
          <aside className="panel pad stack">
            <div className="panel-head">
              <span>New standard</span>
            </div>
            <p className="notice">
              Name the program others will mint against. Publishing puts it in the Earth catalog. Leave program ID
              blank for a local preview. This is not an audit.
            </p>
            <label>
              Standard name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meridian" />
            </label>
            <label>
              Program ID <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              <input value={programId} onChange={(e) => setProgramId(e.target.value)} placeholder="On-chain program, or blank" />
            </label>
            <div className="form-grid">
              <label>
                Kind
                <select value={kind} onChange={(e) => setKind(e.target.value as StandardKind)}>
                  <option value="custom">custom</option>
                  <option value="token-2022">token-2022</option>
                  <option value="spl-token">spl-token</option>
                </select>
              </label>
              <label>
                Amount width
                <select
                  value={width}
                  onChange={(e) => {
                    const next = e.target.value as AmountWidth;
                    setWidth(next);
                    if (next === "u64" && Number(decimals) > 12) setDecimals("9");
                    if (next === "u64") setAmountBase("1000");
                    if (next === "u128") setAmountBase("1000000");
                  }}
                >
                  <option value="u128">u128</option>
                  <option value="u64">u64</option>
                </select>
              </label>
            </div>
            <label>
              Notes <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What this program stores and who should mint on it"
                rows={3}
              />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Publish so other users can find this standard
            </label>
            <label className="check-row">
              <input type="checkbox" checked={listFirst} onChange={(e) => setListFirst(e.target.checked)} />
              Also list my first token now
            </label>
            {listFirst ? (
              <>
                <label>
                  Token ticker
                  <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MRD" />
                </label>
                <label>
                  Token name
                  <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Meridian" />
                </label>
                <div className="form-grid">
                  <label>
                    Decimals
                    <input value={decimals} onChange={(e) => setDecimals(e.target.value)} />
                  </label>
                  <label>
                    Mint <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                    <input value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Blank = preview mint" />
                  </label>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={makePool} onChange={(e) => setMakePool(e.target.checked)} />
                  Create a pool now
                </label>
                {makePool ? (
                  <>
                    <div className="form-grid">
                      <label>
                        Quote asset
                        <select value={quoteMint} onChange={(e) => setQuoteMint(e.target.value)}>
                          {quotes.map((t) => (
                            <option key={t.mint} value={t.mint}>
                              {t.symbol}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Curve
                        <select value={curve} onChange={(e) => setCurve(e.target.value as CurveKind)}>
                          <option value="constant-product">Constant product</option>
                          <option value="stable">Stable</option>
                        </select>
                      </label>
                    </div>
                    <div className="form-grid">
                      <label>
                        Your token amount
                        <input value={amountBase} onChange={(e) => setAmountBase(e.target.value)} />
                      </label>
                      <label>
                        Quote amount
                        <input value={amountQuote} onChange={(e) => setAmountQuote(e.target.value)} />
                      </label>
                    </div>
                    <label>
                      Fee (bps)
                      <input value={feeBps} onChange={(e) => setFeeBps(e.target.value)} />
                    </label>
                  </>
                ) : null}
              </>
            ) : null}
            <button type="button" className="primary" onClick={() => void launch()} disabled={busy}>
              {listFirst && makePool ? "Create standard, token, and pool" : "Create standard"}
            </button>
          </aside>
          <section className="panel pad stack">
            <div className="panel-head">
              <span>What others get</span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13, letterSpacing: 0, textTransform: "none" }}>
              Publishing a standard does not mint supply for you. It registers the adapter: name, program, kind, and
              amount width. Anyone who finds it can list their own ticker, then open a pool. Tokens you list stay in
              this browser until the on-chain program is live.
            </p>
            <ul className="std-points">
              <li>Custom u128 programs can hold supplies SPL cannot.</li>
              <li>Unverified means allowlisted here, not audited.</li>
              <li>Share the card link if the public catalog is unavailable.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function StandardCard({
  std,
  earth,
  highlight,
  addFor,
  addSymbol,
  addName,
  addMint,
  addDecimals,
  setAddFor,
  setAddSymbol,
  setAddName,
  setAddMint,
  setAddDecimals,
  onAddToken,
  onOpenPair,
  onCopied,
  onError,
}: {
  std: TokenStandard;
  earth: EarthState;
  highlight: boolean;
  addFor?: string;
  addSymbol: string;
  addName: string;
  addMint: string;
  addDecimals: string;
  setAddFor: (id?: string) => void;
  setAddSymbol: (v: string) => void;
  setAddName: (v: string) => void;
  setAddMint: (v: string) => void;
  setAddDecimals: (v: string) => void;
  onAddToken: (id: string) => void;
  onOpenPair: (page: "swap" | "liquidity" | "trade", focus: PairFocus) => void;
  onCopied: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const listed = earth.tokens.filter((t) => t.standardId === std.id);
  const local = findStandard(std.id, earth.standards);
  const inCatalog = earth.catalog.some((s) => s.id === std.id) || Boolean(std.published);
  const entry: CatalogStandard = catalogFromStandard(std);

  return (
    <article id={`std-${std.id}`} className={`panel pad stack${highlight ? " std-highlight" : ""}`}>
      <div className="panel-head">
        <span>{std.name}</span>
        <span>
          {std.userCreated ? <span className="pill">yours</span> : null}{" "}
          {inCatalog || std.source === "catalog" || std.source === "seeded" ? <span className="pill">public</span> : null}{" "}
          <span className={`pill${std.review === "unverified" ? " warn" : ""}`}>{std.review}</span>{" "}
          <span className="pill">{std.amountWidth}</span>
        </span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13, letterSpacing: 0, textTransform: "none" }}>
        {std.notes}
      </p>
      <div className="mono muted">{shortAddress(std.programId, 8)}</div>
      {std.publisher ? <div className="muted">Publisher {shortAddress(std.publisher, 4)}</div> : null}
      {reviewChecks(std)
        .slice(0, 2)
        .map((check) => (
          <div key={check} className="pill warn">
            {check}
          </div>
        ))}
      <div>
        {listed.length === 0 ? (
          <p className="notice">No tokens listed in this browser yet. Mint one on this standard.</p>
        ) : (
          listed.map((token) => {
            const pooled = earth.pools.filter((p) => p.tokenA === token.mint || p.tokenB === token.mint);
            return (
              <div key={token.mint} className="listed-token">
                <div className="listed-token-main">
                  <TokenAvatar symbol={token.symbol} size={32} />
                  <div>
                    <strong>{token.symbol}</strong>
                    <div className="muted">
                      {token.name} · {token.decimals} decimals
                    </div>
                  </div>
                </div>
                <div className="row-actions" style={{ marginTop: 0 }}>
                  {pooled[0] ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        onOpenPair("trade", {
                          mintA: token.mint,
                          mintB: pooled[0]?.tokenA === token.mint ? pooled[0].tokenB : pooled[0]?.tokenA,
                        })
                      }
                    >
                      Trade
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => onOpenPair("liquidity", { mintA: token.mint, mintB: WSOL })}
                    >
                      Create pool
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {addFor === std.id ? (
        <div className="stack">
          <div className="form-grid">
            <label>
              Ticker
              <input value={addSymbol} onChange={(e) => setAddSymbol(e.target.value)} />
            </label>
            <label>
              Decimals
              <input value={addDecimals} onChange={(e) => setAddDecimals(e.target.value)} />
            </label>
          </div>
          <label>
            Token name
            <input value={addName} onChange={(e) => setAddName(e.target.value)} />
          </label>
          <label>
            Mint (optional)
            <input value={addMint} onChange={(e) => setAddMint(e.target.value)} />
          </label>
          <div className="row-actions" style={{ marginTop: 0 }}>
            <button type="button" className="primary" onClick={() => onAddToken(std.id)}>
              Mint token
            </button>
            <button type="button" className="ghost" onClick={() => setAddFor(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row-actions" style={{ marginTop: 0 }}>
          <button type="button" className="primary" onClick={() => {
            setAddFor(std.id);
            setAddDecimals(std.amountWidth === "u128" ? "18" : "9");
          }}>
            Mint a token
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const url = shareUrl(entry);
              void navigator.clipboard.writeText(url).then(
                () => onCopied(`Share link copied for ${std.name}. Anyone with it can mint on this standard.`),
                () => onCopied(url),
              );
            }}
          >
            Copy link
          </button>
          {local?.userCreated && !local.published ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                void earth.publishStandard(std.id).then(
                  () => onCopied(`${std.name} is in the public catalog.`),
                  (err: unknown) => onError(err instanceof Error ? err.message : "Could not publish."),
                );
              }}
            >
              Publish
            </button>
          ) : null}
          {canRemoveStandard(std) && local ? (
            <button
              type="button"
              className="danger"
              onClick={() => {
                try {
                  earth.removeUserStandard(std.id);
                } catch (err) {
                  onError(err instanceof Error ? err.message : "Could not remove.");
                }
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function standardForToken(earth: EarthState, mint: string) {
  const token = earth.tokens.find((t) => t.mint === mint);
  return token ? findStandard(token.standardId, earth.standards) : undefined;
}
