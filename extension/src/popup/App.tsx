import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicWalletState, TokenBalance } from "../shared/types";
import { reviewChecks } from "../shared/adapters";
import { CLIPBOARD_CLEAR_MS, MIN_PASSWORD, WSOL } from "../shared/constants";
import { formatAmount, shortAddress } from "../shared/format";
import type { CreateWalletPreview } from "../shared/messages";
import { passwordScore } from "../shared/security";
import { Mark, TokenAvatar } from "./brand";
import { IconBack, IconEye, IconLock } from "./icons";
import { AddressQr } from "./qr";
import { call } from "./rpc";

type View =
  | "boot"
  | "welcome"
  | "seed"
  | "confirm"
  | "password"
  | "import"
  | "unlock"
  | "home"
  | "send"
  | "review"
  | "receive"
  | "activity"
  | "standards"
  | "wallets"
  | "settings";

function PasswordField({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onEnter?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        type={show ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
      />
      <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label="Show password">
        <IconEye off={show} />
      </button>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<PublicWalletState>();
  const [view, setView] = useState<View>("boot");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CreateWalletPreview>();
  const [revealSeed, setRevealSeed] = useState(false);
  const [savedSeed, setSavedSeed] = useState(false);
  const [confirmWords, setConfirmWords] = useState(["", "", ""]);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [selected, setSelected] = useState<TokenBalance>();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [toast, setToast] = useState<string>();
  const [rpcUrl, setRpcUrl] = useState("");
  const [catalogUrl, setCatalogUrl] = useState("");
  const [autoLock, setAutoLock] = useState("15");
  const [standardId, setStandardId] = useState("");
  const [importMnemonic, setImportMnemonic] = useState("");
  const [homeTab, setHomeTab] = useState<"tokens" | "collectibles">("tokens");
  const [exportPw, setExportPw] = useState("");
  const [exported, setExported] = useState<string>();
  const [exportReveal, setExportReveal] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [solUsd, setSolUsd] = useState<number>();

  const load = useCallback(async (next?: View) => {
    const fresh = await call<PublicWalletState>({ type: "GET_STATE" });
    setState(fresh);
    setRpcUrl(fresh.rpcUrl);
    setCatalogUrl(fresh.catalogUrl ?? "");
    setAutoLock(String(fresh.autoLockMinutes));
    if (next) {
      setView(next);
      return fresh;
    }
    if (!fresh.hasVault) setView("welcome");
    else if (!fresh.unlocked) setView("unlock");
    else setView("home");
    return fresh;
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load wallet"));
  }, [load]);

  useEffect(() => {
    if (!state?.unlocked) return;
    const id = window.setInterval(() => void call({ type: "PING" }).catch(() => undefined), 30_000);
    return () => window.clearInterval(id);
  }, [state?.unlocked]);

  useEffect(() => {
    if (!state?.unlocked) return;
    void call<PublicWalletState>({ type: "REFRESH" })
      .then((fresh) => setState(fresh))
      .catch(() => undefined);
  }, [state?.unlocked]);

  useEffect(() => {
    void fetch(`https://lite-api.jup.ag/price/v2?ids=${WSOL}`)
      .then((res) => res.json())
      .then((json: { data?: Record<string, { price?: string | number }> }) => {
        const price = Number(json.data?.[WSOL]?.price);
        if (Number.isFinite(price) && price > 0) setSolUsd(price);
      })
      .catch(() => undefined);
  }, []);

  const sol = state?.balances?.find((b) => b.nativeSol);
  const listed = useMemo(() => {
    if (!state?.balances) return [];
    return [...state.balances].sort((a, b) => {
      if (a.nativeSol) return -1;
      if (b.nativeSol) return 1;
      const av = BigInt(a.amount);
      const bv = BigInt(b.amount);
      return av === bv ? 0 : av > bv ? -1 : 1;
    });
  }, [state]);

  const portfolioUsd = useMemo(() => {
    if (!state) return undefined;
    let total = 0;
    let any = false;
    for (const token of state.balances ?? []) {
      const ui = Number(formatAmount(BigInt(token.amount), token.decimals, 8));
      if (token.nativeSol && solUsd) {
        total += ui * solUsd;
        any = true;
      } else if (token.symbol === "USDC" || token.symbol === "USDT") {
        total += ui;
        any = true;
      }
    }
    return any ? total : undefined;
  }, [solUsd, state]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(undefined), 1400);
  }

  async function copyText(value: string, label: string, clear = false) {
    await navigator.clipboard.writeText(value);
    flash(label);
    if (clear) {
      window.setTimeout(() => void navigator.clipboard.writeText(""), CLIPBOARD_CLEAR_MS);
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!state || view === "boot") {
    return (
      <div className="shell locked">
        <div className="center">
          <div className="logo-wrap">
            <Mark size={48} />
          </div>
          <p className="lede">{error ? "Could not open wallet" : "Loading…"}</p>
          {error ? <p className="notice alert">{error}</p> : null}
        </div>
      </div>
    );
  }

  const unlockedNav = state.unlocked && ["home", "send", "review", "receive", "activity", "standards", "wallets", "settings"].includes(view);
  const strength = passwordScore(password);

  return (
    <div className={`shell${view === "unlock" || view === "welcome" || view === "import" ? " locked" : ""}`}>
      {toast ? <div className="toast">{toast}</div> : null}
      {error ? <p className="notice alert">{error}</p> : null}

      {view === "welcome" ? (
        <div className="center stack">
          <div className="logo-wrap">
            <Mark size={48} />
          </div>
          <p className="kicker">Wallet</p>
          <h1 className="welcome">Earth</h1>
          <p className="lede">A non-custodial wallet for every Solana token standard — including custom adapters.</p>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const created = await call<CreateWalletPreview>({ type: "CREATE_WALLET" });
                setPreview(created);
                setRevealSeed(false);
                setSavedSeed(false);
                setView("seed");
              })
            }
          >
            Create a new wallet
          </button>
          <button type="button" className="ghost" onClick={() => setView("import")}>
            I already have a wallet
          </button>
          <p className="fine">
            Earth never holds your keys or funds. Your secret phrase is encrypted on this device. If you lose it, it
            cannot be recovered.
          </p>
        </div>
      ) : null}

      {view === "seed" && preview ? (
        <div className="grow stack">
          <div className="subhead">
            <h2>Secret recovery phrase</h2>
          </div>
          <p className="notice alert">Never share this phrase. Earth cannot reset it. Anyone with these words can take your funds.</p>
          <button type="button" className="ghost" onClick={() => setRevealSeed(true)}>
            {revealSeed ? "Hide phrase" : "Click to reveal"}
          </button>
          <div className={`seed-grid${revealSeed ? "" : " hidden"}`}>
            {preview.mnemonic.split(" ").map((word, i) => (
              <span key={`${word}-${i}`}>
                <em>{i + 1}</em>
                {word}
              </span>
            ))}
          </div>
          <button type="button" className="ghost" disabled={!revealSeed} onClick={() => void copyText(preview.mnemonic, "Copied — clipboard clears in 60s", true)}>
            Copy
          </button>
          <label className="check-row">
            <input type="checkbox" checked={savedSeed} onChange={(e) => setSavedSeed(e.target.checked)} />
            I saved my secret recovery phrase
          </label>
          <button type="button" className="primary" disabled={!savedSeed} onClick={() => setView("confirm")}>
            Continue
          </button>
        </div>
      ) : null}

      {view === "confirm" && preview ? (
        <div className="grow stack">
          <div className="subhead">
            <h2>Confirm your phrase</h2>
          </div>
          <p className="lede">Enter the requested words so we know this phrase is written down.</p>
          {preview.indexes.map((index, i) => (
            <label key={index}>
              Word {index + 1}
              <input
                value={confirmWords[i]}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => {
                  const next = [...confirmWords];
                  next[i] = e.target.value;
                  setConfirmWords(next);
                }}
              />
            </label>
          ))}
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({ type: "CONFIRM_BACKUP", indexes: preview.indexes, words: confirmWords });
                setView("password");
              })
            }
          >
            Continue
          </button>
        </div>
      ) : null}

      {view === "password" ? (
        <div className="grow stack">
          <div className="subhead">
            <h2>Create a password</h2>
          </div>
          <p className="lede">This unlocks Earth on this browser. It is not a recovery method. Earth cannot reset it.</p>
          <label>
            Password
            <PasswordField value={password} onChange={setPassword} />
          </label>
          <div className="strength" aria-label={strength.label}>
            <i className={strength.score >= 1 ? (strength.score === 1 ? "warn" : "on") : ""} />
            <i className={strength.score >= 2 ? "on" : ""} />
            <i className={strength.score >= 3 ? "on" : ""} />
          </div>
          <p className="fine">{strength.label}. Use at least {MIN_PASSWORD} characters.</p>
          <label>
            Confirm password
            <PasswordField value={password2} onChange={setPassword2} />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (password !== password2) throw new Error("Passwords do not match.");
                await call({ type: "FINISH_CREATE", password });
                setPassword("");
                setPassword2("");
                setPreview(undefined);
                await load("home");
              })
            }
          >
            Finish
          </button>
        </div>
      ) : null}

      {view === "import" ? (
        <div className="grow stack">
          <div className="subhead">
            <button type="button" className="icon-btn" onClick={() => setView("welcome")}>
              <IconBack />
            </button>
            <h2>Import wallet</h2>
          </div>
          <p className="lede">Paste the 12 or 24 word secret phrase. Not the wallet address.</p>
          <label>
            Secret recovery phrase
            <textarea rows={4} value={mnemonic} autoComplete="off" autoCorrect="off" spellCheck={false} onChange={(e) => setMnemonic(e.target.value)} />
          </label>
          <label>
            New password
            <PasswordField value={password} onChange={setPassword} />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({ type: "IMPORT_WALLET", mnemonic, password });
                setMnemonic("");
                setPassword("");
                await load("home");
              })
            }
          >
            Import
          </button>
        </div>
      ) : null}

      {view === "unlock" ? (
        <div className="center stack">
          <div className="logo-wrap">
            <Mark size={48} />
          </div>
          <p className="kicker">Wallet</p>
          <h1 className="welcome">Welcome back</h1>
          <p className="lede">Unlock your non-custodial wallet. Earth never has your keys.</p>
          <label>
            Password
            <PasswordField
              value={password}
              onChange={setPassword}
              onEnter={() =>
                void run(async () => {
                  await call({ type: "UNLOCK", password });
                  setPassword("");
                  await load("home");
                })
              }
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({ type: "UNLOCK", password });
                setPassword("");
                await load("home");
              })
            }
          >
            Unlock
          </button>
          <button type="button" className="danger" onClick={() => setForgot((v) => !v)}>
            Forgot password?
          </button>
          {forgot ? (
            <p className="notice">
              Earth cannot recover this password. Import your secret recovery phrase to restore this wallet on a new
              password.
            </p>
          ) : null}
        </div>
      ) : null}

      {view === "home" && state.unlocked ? (
        <>
          <header className="topbar">
            <button type="button" className="brand brand-btn" onClick={() => setView("wallets")}>
              <Mark size={32} />
              <div>
                <h1>{state.accounts.find((row) => row.id === state.activeAccountId)?.name ?? "Earth"}</h1>
                <p>Switch wallet</p>
              </div>
            </button>
            <div className="header-actions">
              <span className="status-pill">
                <span className="status-dot" />
                {state.networkLabel}
              </span>
              <button
                type="button"
                className="icon-btn"
                title="Lock"
                onClick={() =>
                  void run(async () => {
                    await call({ type: "LOCK" });
                    await load("unlock");
                  })
                }
              >
                <IconLock />
              </button>
            </div>
          </header>
          <section className="balance-panel">
            <p className="kicker">Portfolio</p>
            <p className="usd">
              {portfolioUsd != null
                ? `$${portfolioUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : `${formatAmount(BigInt(sol?.amount ?? "0"), 9, 4)} SOL`}
            </p>
            <button
              type="button"
              className="wallet-chip mono"
              onClick={() => void copyText(state.address ?? "", "Address copied")}
              title={state.address}
            >
              <span className="wallet-dot" />
              {state.solDomain ?? shortAddress(state.address ?? "", 4)}
            </button>
          </section>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setSelected(sol);
                setAmount("");
                setTo("");
                setView("send");
              }}
            >
              Send
            </button>
            <button type="button" className="ghost" onClick={() => setView("receive")}>
              Receive
            </button>
          </div>
          <section className="panel assets">
            <div className="panel-head">
              <div className="segment">
                <button type="button" className={homeTab === "tokens" ? "active" : ""} onClick={() => setHomeTab("tokens")}>
                  Tokens
                </button>
                <button
                  type="button"
                  className={homeTab === "collectibles" ? "active" : ""}
                  onClick={() => setHomeTab("collectibles")}
                >
                  Collectibles
                </button>
              </div>
              <button
                type="button"
                className="linkish"
                onClick={() =>
                  void run(async () => {
                    await call({ type: "REFRESH" });
                    await load("home");
                  })
                }
              >
                Refresh
              </button>
            </div>
            <div className="grow">
              {homeTab === "tokens"
                ? listed.map((token) => (
                    <button
                      key={token.mint + token.standardId + (token.nativeSol ? "-native" : "")}
                      type="button"
                      className="token-row"
                      onClick={() => {
                        setSelected(token);
                        setAmount("");
                        setTo("");
                        setView("send");
                      }}
                    >
                      <TokenAvatar symbol={token.symbol} size={36} />
                      <div className="token-meta">
                        <strong>{token.symbol}</strong>
                        <span>
                          {token.name}
                          {token.amountWidth === "u128" ? " · u128" : ""}
                          {token.extensions.includes("transfer-fee") ? " · fee" : ""}
                        </span>
                      </div>
                      <div className="token-amt">
                        {formatAmount(BigInt(token.amount), token.decimals)}
                        {token.nativeSol && solUsd ? (
                          <small>
                            $
                            {(Number(formatAmount(BigInt(token.amount), token.decimals, 8)) * solUsd).toLocaleString(
                              undefined,
                              { maximumFractionDigits: 2 },
                            )}
                          </small>
                        ) : null}
                      </div>
                    </button>
                  ))
                : (state.collectibles ?? []).length === 0
                  ? <p className="lede" style={{ padding: "12px 10px" }}>No collectibles on this wallet.</p>
                  : (state.collectibles ?? []).map((item) => (
                      <div key={item.mint} className="token-row nft-row">
                        {item.image ? (
                          <img className="nft-thumb" src={item.image} alt="" />
                        ) : (
                          <TokenAvatar symbol={item.symbol || item.name || "NFT"} size={36} />
                        )}
                        <div className="token-meta">
                          <strong>{item.name}</strong>
                          <span>
                            {item.collection ? shortAddress(item.collection, 4) : item.compressed ? "compressed" : "collectible"}
                            {item.amount !== "1" ? ` · ×${item.amount}` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
            </div>
          </section>
        </>
      ) : null}

      {view === "send" && selected ? (
        <div className="grow stack">
          <div className="subhead">
            <button type="button" className="icon-btn" onClick={() => setView("home")}>
              <IconBack />
            </button>
            <h2>Send {selected.symbol}</h2>
          </div>
          <p className="lede" style={{ margin: 0 }}>
            Balance {formatAmount(BigInt(selected.amount), selected.decimals)} {selected.symbol}
          </p>
          {selected.frozen ? <p className="notice alert">This account is frozen.</p> : null}
          {selected.nonTransferable ? <p className="notice alert">Non-transferable mint.</p> : null}
          <label className="field">
            Amount
            <input value={amount} inputMode="decimal" placeholder="0" onChange={(e) => setAmount(e.target.value)} />
            <button
              type="button"
              className="max-btn"
              onClick={() => setAmount(formatAmount(BigInt(selected.amount), selected.decimals, selected.decimals))}
            >
              Max
            </button>
          </label>
          <label>
            To
            <input value={to} placeholder="Solana address" autoCorrect="off" spellCheck={false} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button
            type="button"
            className="primary"
            disabled={selected.frozen || selected.nonTransferable || !to || !amount}
            onClick={() => setView("review")}
          >
            Next
          </button>
        </div>
      ) : null}

      {view === "review" && selected ? (
        <div className="grow stack">
          <div className="subhead">
            <button type="button" className="icon-btn" onClick={() => setView("send")}>
              <IconBack />
            </button>
            <h2>Review</h2>
          </div>
          <div className="review-row">
            <span>Asset</span>
            <strong>{selected.symbol}</strong>
          </div>
          <div className="review-row">
            <span>Amount</span>
            <strong>{amount}</strong>
          </div>
          <div className="review-row">
            <span>To</span>
            <strong className="mono">{shortAddress(to, 6)}</strong>
          </div>
          <div className="review-row">
            <span>Network fee</span>
            <strong>~0.000005 SOL</strong>
          </div>
          <p className="fine">Signed locally. Earth never broadcasts with a hosted key.</p>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await call<{ signature: string }>({
                  type: "SEND",
                  mint: selected.mint,
                  to,
                  amount,
                  standardId: selected.standardId,
                  nativeSol: selected.nativeSol,
                });
                flash("Sent");
                await copyText(result.signature, "Signature copied");
                await load("activity");
              })
            }
          >
            Confirm send
          </button>
        </div>
      ) : null}

      {view === "receive" ? (
        <div className="grow stack">
          <div className="subhead">
            <button type="button" className="icon-btn" onClick={() => setView("home")}>
              <IconBack />
            </button>
            <h2>Your address</h2>
          </div>
          <div className="qr-wrap">
            <AddressQr value={state.address ?? ""} />
          </div>
          <p className="mono notice">{state.address}</p>
          <button type="button" className="primary" onClick={() => void copyText(state.address ?? "", "Address copied")}>
            Copy address
          </button>
          <p className="fine">Only send SOL and Solana tokens (SPL, Token-2022, or Earth adapters) to this address.</p>
        </div>
      ) : null}

      {view === "activity" && state.unlocked ? (
        <div className="grow stack">
          <div className="subhead">
            <h2>Activity</h2>
          </div>
          {state.activity.length === 0 ? <p className="lede">No transactions yet.</p> : null}
          {state.activity.map((item) => (
            <a
              key={item.signature}
              className="activity"
              href={`https://solscan.io/tx/${item.signature}`}
              target="_blank"
              rel="noreferrer"
            >
              <div>
                <strong>{item.summary}</strong>
                <div className="fine" style={{ margin: 0 }}>
                  {shortAddress(item.signature, 8)}
                </div>
              </div>
              <span>{new Date(item.at).toLocaleString()}</span>
            </a>
          ))}
        </div>
      ) : null}

      {view === "standards" ? (
        <div className="grow stack">
          <div className="subhead">
            <h2>Standards</h2>
          </div>
          <p className="lede">
            Create a new standard on the Earth site — upload public source, burn $1,000 of $EARTH, Earth deploys. Seeded
            factories here include Memecoin, Reflect, Confidential, Vest, Mandate (AI-agent), Kernel, Proxy, Flash, and
            Chamber (DAO). Paste a standard
            ID or share code so this wallet can hold its tokens. Source is shown on each card when the catalog has it.
          </p>
          <label>
            Standard ID
            <input
              value={standardId}
              onChange={(e) => setStandardId(e.target.value)}
              placeholder="TSxxx10"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy || !standardId.trim()}
            onClick={() =>
              void run(async () => {
                await call({ type: "IMPORT_STANDARD", id: standardId });
                setStandardId("");
                await load("standards");
                flash("Standard imported");
              })
            }
          >
            Import
          </button>
          {state.standards.map((standard) => (
            <article key={standard.id} className="notice stack">
              <div className="header" style={{ margin: 0 }}>
                <strong>{standard.name}</strong>
                <span className="pill">{standard.id}</span>
              </div>
              {reviewChecks(standard).slice(0, 1).map((check) => (
                <span key={check} className="pill warn">
                  {check}
                </span>
              ))}
              {standard.sourceCode?.code ? (
                <details>
                  <summary className="fine">Public source · {standard.sourceCode.filename}</summary>
                  <pre className="source-pre">{standard.sourceCode.code}</pre>
                </details>
              ) : null}
              {standard.userCreated || standard.source === "catalog" ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    void run(async () => {
                      await call({ type: "REMOVE_STANDARD", standardId: standard.id });
                      await load("standards");
                    })
                  }
                >
                  Remove
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {view === "wallets" && state.unlocked ? (
        <div className="grow stack">
          <div className="subhead">
            <button type="button" className="icon-btn" onClick={() => setView("home")}>
              <IconBack />
            </button>
            <h2>Wallets</h2>
          </div>
          <p className="lede">Derived wallets share this seed. Import another seed to add a separate wallet.</p>
          {state.accounts.map((account) => (
            <div key={account.id} className={`account-card${account.id === state.activeAccountId ? " active" : ""}`}>
              <button
                type="button"
                className="account-main"
                onClick={() =>
                  void run(async () => {
                    if (account.id !== state.activeAccountId) await call({ type: "SWITCH_ACCOUNT", id: account.id });
                    await load("home");
                  })
                }
              >
                <strong>{account.name}</strong>
                <span className="mono">{shortAddress(account.address, 4)}</span>
              </button>
              <div className="account-actions">
                {account.id === state.activeAccountId ? <span className="pill">Active</span> : null}
                <span className="pill">{account.kind === "imported" ? "Imported" : "Derived"}</span>
                {state.accounts.length > 1 ? (
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      void run(async () => {
                        await call({ type: "REMOVE_ACCOUNT", id: account.id });
                        await load("wallets");
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({ type: "ADD_ACCOUNT" });
                await load("home");
              })
            }
          >
            Add wallet
          </button>
          <label>
            Import another seed
            <textarea
              rows={3}
              value={importMnemonic}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setImportMnemonic(e.target.value)}
              placeholder="12 or 24 words"
            />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={busy || !importMnemonic.trim()}
            onClick={() =>
              void run(async () => {
                await call({ type: "IMPORT_ACCOUNT", mnemonic: importMnemonic });
                setImportMnemonic("");
                await load("home");
              })
            }
          >
            Import wallet
          </button>
        </div>
      ) : null}

      {view === "settings" ? (
        <div className="grow stack">
          <div className="subhead">
            <h2>Settings</h2>
          </div>
          <p className="notice">Non-custodial. Keys are encrypted on this Chrome profile. Earth has no servers for your seed.</p>
          <label>
            RPC
            <input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({ type: "SET_RPC", url: rpcUrl });
                await load("settings");
                flash("RPC saved");
              })
            }
          >
            Save RPC
          </button>
          <label>
            Earth catalog URL
            <input
              value={catalogUrl}
              onChange={(e) => setCatalogUrl(e.target.value)}
              placeholder="https://your-earth-site.netlify.app"
            />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({ type: "SET_CATALOG", url: catalogUrl });
                await load("settings");
                flash("Catalog saved");
              })
            }
          >
            Save catalog
          </button>
          <label>
            Auto-lock (minutes)
            <input value={autoLock} onChange={(e) => setAutoLock(e.target.value)} />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({ type: "SET_AUTOLOCK", minutes: Number(autoLock) || 0 });
                await load("settings");
                flash("Auto-lock saved");
              })
            }
          >
            Save auto-lock
          </button>
          <p className="lede">Trusted apps</p>
          {state.sites.length === 0 ? <p className="fine">No connected apps.</p> : null}
          {state.sites.map((site) => (
            <div key={site.origin} className="header">
              <span className="mono" style={{ fontSize: 12 }}>
                {site.origin}
              </span>
              <button
                type="button"
                className="danger"
                onClick={() =>
                  void run(async () => {
                    await call({ type: "FORGET_SITE", origin: site.origin });
                    await load("settings");
                  })
                }
              >
                Disconnect
              </button>
            </div>
          ))}
          <p className="lede">Show secret phrase</p>
          <p className="notice alert">Do this only in private. Earth will never ask for this phrase.</p>
          <label>
            Password
            <PasswordField value={exportPw} onChange={setExportPw} />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await call<{ mnemonic: string }>({ type: "EXPORT_SEED", password: exportPw });
                setExported(result.mnemonic);
                setExportReveal(false);
                setExportPw("");
              })
            }
          >
            Reveal
          </button>
          {exported ? (
            <>
              <button type="button" className="ghost" onClick={() => setExportReveal(true)}>
                {exportReveal ? "Hide" : "Click to reveal"}
              </button>
              <div className={`seed-grid${exportReveal ? "" : " hidden"}`}>
                {exported.split(" ").map((word, i) => (
                  <span key={`${word}-${i}`}>
                    <em>{i + 1}</em>
                    {word}
                  </span>
                ))}
              </div>
              <button type="button" className="ghost" onClick={() => void copyText(exported, "Copied — clipboard clears in 60s", true)}>
                Copy
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {unlockedNav ? (
        <nav className="tabbar">
          <button type="button" className={view === "home" || view === "send" || view === "review" || view === "receive" ? "active" : ""} onClick={() => setView("home")}>
            Home
          </button>
          <button type="button" className={view === "activity" ? "active" : ""} onClick={() => setView("activity")}>
            Activity
          </button>
          <button type="button" className={view === "standards" ? "active" : ""} onClick={() => setView("standards")}>
            Standards
          </button>
          <button type="button" className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            Settings
          </button>
        </nav>
      ) : null}
    </div>
  );
}
