import { useEffect, useMemo, useState } from "react";
import type { EarthState } from "../useEarth";
import type { AmountWidth, CatalogStandard, CurveKind, PairFocus, TokenStandard } from "../types";
import { catalogFromStandard, mergeStandards, shareUrl } from "../adapters/catalog.ts";
import { canRemoveStandard, findStandard, reviewChecks } from "../adapters/registry.ts";
import { defaultVariableValues, findFactory } from "../standards/factories.ts";
import { configSummary, fillAgentDefaults, parseMintConfig } from "../standards/validate.ts";
import { shortAddress } from "../lib/format.ts";
import { STANDARD_CREATE_FEE_USD, WSOL } from "../lib/constants.ts";
import {
  quoteStandardCreateBurn,
  standardCreateFeeHeadline,
  standardCreateFeeUsdLabel,
} from "../lib/earthFee.ts";
import { isLiveEarthProgram } from "../lib/ids.ts";
import { USDC } from "../data/tokens.ts";
import { canLockToken } from "../lib/tokenSafety.ts";
import { TokenAvatar } from "./TokenAvatar.tsx";
import { FactoryMint } from "./FactoryMint.tsx";
import { MintVariables } from "./MintVariables.tsx";
import { LockAuthorities, SafeBadge } from "./LockAuthorities.tsx";
import { SourceCodeView } from "./SourceCode.tsx";
import { MAX_SOURCE_CHARS, readSourceFile } from "../standards/source.ts";

type Mode = "browse" | "contract" | "create" | "lock";
type Filter = "all" | "factory" | "custom" | "native" | "mine";

export function StandardsView({
  earth,
  onOpenPair,
  focusId,
  adoptCode,
}: {
  earth: EarthState;
  onOpenPair: (page: "trade" | "liquidity" | "dex", focus: PairFocus) => void;
  focusId?: string;
  adoptCode?: string;
}) {
  const [mode, setMode] = useState<Mode>("browse");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shareIn, setShareIn] = useState(adoptCode ?? "");
  const [highlight, setHighlight] = useState(focusId);
  const [name, setName] = useState("");
  const [width, setWidth] = useState<AmountWidth>("u128");
  const [notes, setNotes] = useState("");
  const [publish, setPublish] = useState(true);
  const [listFirst, setListFirst] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [tokenName, setTokenName] = useState("");
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
  const [addVars, setAddVars] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lockMint, setLockMint] = useState<string>();
  const [sourceName, setSourceName] = useState("lib.rs");
  const [sourceCode, setSourceCode] = useState("");

  const quotes = useMemo(
    () => earth.tokens.filter((t) => t.mint === WSOL || t.mint === USDC),
    [earth.tokens],
  );
  const createFee = useMemo(
    () => quoteStandardCreateBurn(earth.tokens, earth.pools),
    [earth.pools, earth.tokens],
  );
  const createFeeLabel = standardCreateFeeUsdLabel();
  const lockable = useMemo(() => earth.tokens.filter((t) => canLockToken(t)), [earth.tokens]);
  const selectedLock = lockable.find((t) => t.mint === lockMint) ?? lockable[0];

  const visible = useMemo(() => {
    const merged = mergeStandards(earth.standards, earth.catalog);
    const needle = query.trim().toLowerCase();
    return merged
      .filter((std) => {
        if (filter === "factory") return Boolean(std.factory);
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
          std.id.toLowerCase().includes(needle) ||
          (std.sourceCode?.filename.toLowerCase().includes(needle) ?? false)
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
    void earth
      .adoptStandard(adoptCode)
      .then((adopted) => {
        setHighlight(adopted.id);
        setShareIn("");
        setNote(`Added ${adopted.name}. Create a contract on it below.`);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not adopt that standard.");
      });
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
        amountWidth: width,
        notes,
        publish,
        sourceCode: { filename: sourceName, code: sourceCode },
        symbol: listFirst ? symbol : "",
        tokenName,
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
        ? "It is in the public catalog — other users can find it and create a contract on it."
        : "Copy the share link from its card so others can find it (catalog publish did not go through).";
      setNote(
        result.token
          ? `${result.token.symbol} is listed on ${result.standard.name} (${result.standard.id}). ${where}`
          : `${result.standard.name} is ready. Standard ID ${result.standard.id}. Earth deploys the program; others can create contracts on this standard. ${where}`,
      );
      setHighlight(result.standard.id);
      setMode("browse");
      setName("");
      setNotes("");
      setSymbol("");
      setTokenName("");
      setSourceName("lib.rs");
      setSourceCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the standard.");
    } finally {
      setBusy(false);
    }
  }

  function addToken(standardId: string) {
    setError(undefined);
    setBusy(true);
    void (async () => {
      try {
        if (!earth.wallet) throw new Error("Connect Earth Wallet to mint on-chain.");
        const factory = findFactory(standardId);
        const config = factory ? parseMintConfig(factory, fillAgentDefaults(addVars, earth.wallet)) : undefined;
        const { token } = await earth.addTokenToStandard(standardId, {
          symbol: addSymbol,
          name: addName,
          mint: addMint,
          decimals: Number(addDecimals),
          config,
        });
        setAddFor(undefined);
        setAddSymbol("");
        setAddName("");
        setAddMint("");
        setAddVars({});
        setNote(`${token.symbol} minted. Lock authorities so DEX marks it Safe, or create a pool from this card.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create the contract.");
      } finally {
        setBusy(false);
      }
    })();
  }

  function adoptFromBox() {
    setError(undefined);
    void earth
      .adoptStandard(shareIn)
      .then((adopted) => {
        setShareIn("");
        setHighlight(adopted.id);
        setNote(`Added ${adopted.name}. Create a contract on it.`);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not read that share code.");
      });
  }

  return (
    <div className="stack">
      <div className="std-tabs">
        <button type="button" className={mode === "browse" ? "active" : ""} onClick={() => setMode("browse")}>
          Browse standards
        </button>
        <button type="button" className={mode === "contract" ? "active" : ""} onClick={() => setMode("contract")}>
          Create a contract
        </button>
        <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>
          Create a standard
        </button>
        <button type="button" className={mode === "lock" ? "active" : ""} onClick={() => setMode("lock")}>
          Lock authorities
        </button>
      </div>

      {error ? <p className="notice alert">{error}</p> : null}
      {note ? <p className="notice">{note}</p> : null}

      {mode === "contract" ? (
        <FactoryMint
          earth={earth}
          onOpenPair={onOpenPair}
          onDone={(msg) => {
            setError(undefined);
            setNote(msg);
            setMode("browse");
          }}
          onError={(msg) => {
            setNote(undefined);
            setError(msg || undefined);
          }}
        />
      ) : null}

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
              A standard is a program. Earth ships nine factories (Mandate, Kernel, Proxy, Flash, Chamber, and the
              rest). Open Create a contract and pick a card — do not look for Launch curve. Or burn {createFeeLabel} for
              a new standard of your own. Native SPL and Token-2022 stay here.
            </p>
            <input
              className="search-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, standard ID, or notes"
            />
            <div className="std-filters">
              {(
                [
                  ["all", "All"],
                  ["factory", "Factories"],
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
              addVars={addVars}
              setAddFor={(id) => {
                setAddFor(id);
                setAddMint("");
                const factory = id ? findFactory(id) : undefined;
                setAddVars(factory ? defaultVariableValues(factory) : {});
                if (factory) setAddDecimals(String(factory.defaultDecimals));
                else setAddDecimals(id && findStandard(id, earth.standards)?.amountWidth === "u128" ? "18" : "9");
              }}
              setAddSymbol={setAddSymbol}
              setAddName={setAddName}
              setAddMint={setAddMint}
              setAddDecimals={setAddDecimals}
              setAddVars={setAddVars}
              onAddToken={addToken}
              onOpenPair={onOpenPair}
              onCopied={(msg) => {
                setError(undefined);
                setNote(msg);
              }}
              onError={setError}
              onLock={(mint) => {
                setLockMint(mint);
                setMode("lock");
              }}
            />
          ))}
        </div>
      ) : null}

      {mode === "lock" ? (
        <div className="swap-grid">
          <aside className="panel pad stack">
            <div className="panel-head">
              <span>Your tokens</span>
              <span className="pill">{lockable.length}</span>
            </div>
            <p className="notice">
              Lock supply, revoke freeze, and freeze metadata. When all three are done, DEX marks the ticker Safe —
              supply and name cannot be changed.
            </p>
            {lockable.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Create a contract first. Built-in listings like SOL cannot be locked from here.
              </p>
            ) : (
              <div className="lock-pick">
                {lockable.map((token) => (
                  <button
                    key={token.mint}
                    type="button"
                    className={`factory-card${selectedLock?.mint === token.mint ? " active" : ""}`}
                    onClick={() => setLockMint(token.mint)}
                  >
                    <strong>
                      {token.symbol} <SafeBadge token={token} />
                    </strong>
                    <span>{token.name}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
          <section className="panel pad stack">
            {selectedLock ? (
              <LockAuthorities
                earth={earth}
                token={selectedLock}
                onDone={(msg) => {
                  setError(undefined);
                  setNote(msg);
                }}
                onError={(msg) => {
                  setNote(undefined);
                  setError(msg || undefined);
                }}
              />
            ) : (
              <>
                <div className="panel-head">
                  <span>Lock authorities</span>
                </div>
                <p className="lede">Create a contract on a factory or standard, then lock it here so traders see Safe.</p>
                <div className="row-actions">
                  <button type="button" className="primary" onClick={() => setMode("contract")}>
                    Create a contract
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      {mode === "create" ? (
        <div className="swap-grid">
          <aside className="panel pad stack">
            <div className="panel-head">
              <span>New standard</span>
            </div>
            <p className="notice">
              Upload the token contract source. It is public — anyone who finds this standard can read it. Earth assigns
              a Standard ID and deploys the program. Listing it burns {createFeeLabel}. You never paste a program ID.
            </p>
            <label>
              Standard name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aurora" />
            </label>
            <label>
              Amount size
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
                <option value="u128">Large (u128) — 18-decimal supplies SPL cannot hold</option>
                <option value="u64">Normal (u64) — same size as SPL</option>
              </select>
            </label>
            <div className="source-upload">
              <div className="source-upload-head">
                <span>Token contract source</span>
                <span className="pill">required · public</span>
              </div>
              <p className="notice">
                Upload or paste the program source (typically <span className="mono">lib.rs</span>). Everyone who opens
                this standard can read it. Max {MAX_SOURCE_CHARS.toLocaleString()} characters. Not a binary or{" "}
                <span className="mono">.so</span>.
              </p>
              <label className="source-file">
                Upload file
                <input
                  type="file"
                  accept=".rs,.toml,.txt,.sol,.md"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void readSourceFile(file)
                      .then((parsed) => {
                        setError(undefined);
                        setSourceName(parsed.filename);
                        setSourceCode(parsed.code);
                      })
                      .catch((err: unknown) => {
                        setError(err instanceof Error ? err.message : "Could not read that file.");
                      });
                    e.target.value = "";
                  }}
                />
              </label>
              <label>
                Filename
                <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="lib.rs" />
              </label>
              <label>
                Source
                <textarea
                  className="source-editor"
                  value={sourceCode}
                  onChange={(e) => setSourceCode(e.target.value)}
                  placeholder={"use solana_program::{account_info::AccountInfo, entrypoint, pubkey::Pubkey};\n\nentrypoint!(process_instruction);\n\nfn process_instruction(\n    _program_id: &Pubkey,\n    _accounts: &[AccountInfo],\n    _data: &[u8],\n) -> Result<(), u64> {\n    Ok(())\n}"}
                  rows={14}
                  spellCheck={false}
                />
              </label>
            </div>
            <label>
              Notes <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What this standard is for"
                rows={2}
              />
            </label>
            <div className="fee-callout">
              <strong>{standardCreateFeeHeadline(createFee)}</strong>
              <span>
                Burned to list this standard — not paid to Earth. Earth deploys the source you uploaded.
                {createFee.priced
                  ? ` Quoted at the current $EARTH price for $${STANDARD_CREATE_FEE_USD.toLocaleString()}.`
                  : ` Amount in $EARTH is quoted from the live price when $EARTH is trading.`}
                {createFee.mintSet
                  ? " Earth Wallet will burn that $EARTH when the mint is configured."
                  : " $EARTH is not listed yet, so this listing is free until the mint goes live."}
                {earth.wallet
                  ? ` When the burn is live, it comes from ${shortAddress(earth.wallet, 4)}.`
                  : " Connect Earth Wallet so the burn can come from your account when $EARTH is live."}
              </span>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Publish so other users can find this standard
            </label>
            <label className="check-row">
              <input type="checkbox" checked={listFirst} onChange={(e) => setListFirst(e.target.checked)} />
              Also create my first contract now
            </label>
            {listFirst ? (
              <>
                <label>
                  Token ticker
                  <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="FROG" />
                </label>
                <label>
                  Token name
                  <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Forest Frog" />
                </label>
                <label>
                  Decimals
                  <input value={decimals} onChange={(e) => setDecimals(e.target.value)} />
                </label>
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
            <button
              type="button"
              className="primary"
              onClick={() => void launch()}
              disabled={busy || !name.trim() || !sourceCode.trim()}
            >
              {listFirst && makePool
                ? "Create standard, contract, and pool"
                : listFirst
                  ? "Create standard and contract"
                  : "Create standard"}
            </button>
          </aside>
          <section className="panel pad stack">
            <div className="panel-head">
              <span>What you burn</span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13, letterSpacing: 0, textTransform: "none" }}>
              A new standard is a new program. You upload the source; it stays visible on the public card. Earth deploys
              it and holds upgrade authority. You burn {createFeeLabel} and pick the name plus amount size. Anyone who
              finds it can create their own contract on it. This is not an audit.
            </p>
            <ul className="std-points">
              <li>Source is required and public. There is no private custom standard.</li>
              <li>You never paste a program ID. Earth assigns it.</li>
              <li>Listing your own standard burns {createFeeLabel}. Creating a contract on a factory or someone else’s standard does not.</li>
              <li>Large (u128) standards can hold supplies SPL cannot.</li>
              <li>Share the card link if the public catalog is unavailable.</li>
            </ul>
          </section>
        </div>
      ) : null}
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
  addVars,
  setAddFor,
  setAddSymbol,
  setAddName,
  setAddMint,
  setAddDecimals,
  setAddVars,
  onAddToken,
  onOpenPair,
  onCopied,
  onError,
  onLock,
}: {
  std: TokenStandard;
  earth: EarthState;
  highlight: boolean;
  addFor?: string;
  addSymbol: string;
  addName: string;
  addMint: string;
  addDecimals: string;
  addVars: Record<string, string>;
  setAddFor: (id?: string) => void;
  setAddSymbol: (v: string) => void;
  setAddName: (v: string) => void;
  setAddMint: (v: string) => void;
  setAddDecimals: (v: string) => void;
  setAddVars: (v: Record<string, string>) => void;
  onAddToken: (id: string) => void;
  onOpenPair: (page: "trade" | "liquidity" | "dex", focus: PairFocus) => void;
  onCopied: (msg: string) => void;
  onError: (msg: string) => void;
  onLock: (mint: string) => void;
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
          {std.factory ? <span className="pill">factory</span> : null}{" "}
          {std.userCreated ? <span className="pill">yours</span> : null}{" "}
          {inCatalog || std.source === "catalog" || std.source === "seeded" ? <span className="pill">public</span> : null}{" "}
          <span className={`pill${std.review === "unverified" ? " warn" : ""}`}>{std.review}</span>{" "}
          <span className="pill">{std.amountWidth}</span>
        </span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13, letterSpacing: 0, textTransform: "none" }}>
        {std.notes}
      </p>
      <div className="std-id mono">Standard ID {std.id}</div>
      <div className="muted">
        {std.kind === "custom" && !isLiveEarthProgram(std.programId)
          ? "Earth deploys this program"
          : shortAddress(std.programId, 8)}
      </div>
      {std.publisher ? <div className="muted">Publisher {shortAddress(std.publisher, 4)}</div> : null}
      <SourceCodeView
        source={std.sourceCode}
        empty={
          std.kind === "custom"
            ? "No public source on this standard yet. New standards require it."
            : undefined
        }
      />
      {reviewChecks(std)
        .slice(0, 2)
        .map((check) => (
          <div key={check} className="pill warn">
            {check}
          </div>
        ))}
      <div>
        {listed.length === 0 ? (
          <p className="notice">No contracts on this standard yet. Create one below — Earth mints it on-chain.</p>
        ) : (
          listed.map((token) => {
            const pooled = earth.pools.filter((p) => p.tokenA === token.mint || p.tokenB === token.mint);
            return (
              <div key={token.mint} className="listed-token">
                <div className="listed-token-main">
                  <TokenAvatar symbol={token.symbol} logo={token.logo} size={32} />
                  <div>
                    <strong>
                      {token.symbol} <SafeBadge token={token} />
                    </strong>
                    <div className="muted">
                      {token.name} · {token.decimals} decimals
                      {configSummary(token.config).length
                        ? ` · ${configSummary(token.config).join(" · ")}`
                        : ""}
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
                  {canLockToken(token) ? (
                    <button type="button" className="ghost" onClick={() => onLock(token.mint)}>
                      Lock
                    </button>
                  ) : null}
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
          {findFactory(std.id) ? (
            <MintVariables
              factory={findFactory(std.id)!}
              values={addVars}
              onChange={(key, value) => setAddVars({ ...addVars, [key]: value })}
            />
          ) : null}
          {std.kind === "spl-token" || std.kind === "token-2022" ? (
            <label>
              Contract address <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              <input
                value={addMint}
                onChange={(e) => setAddMint(e.target.value)}
                placeholder="Blank = Earth assigns one"
              />
            </label>
          ) : null}
          <div className="row-actions" style={{ marginTop: 0 }}>
            <button type="button" className="primary" onClick={() => onAddToken(std.id)}>
              Create contract
            </button>
            <button type="button" className="ghost" onClick={() => setAddFor(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row-actions" style={{ marginTop: 0 }}>
          <button type="button" className="primary" onClick={() => setAddFor(std.id)}>
            Create a contract
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const url = shareUrl(entry);
              void navigator.clipboard.writeText(url).then(
                () => onCopied(`Share link copied for ${std.name}. Anyone with it can create a contract on this standard.`),
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
