import { useCallback, useEffect, useMemo, useState } from "react";
import type { AmountWidth, PublicWalletState, StandardKind, TokenBalance } from "../shared/types";
import { decodeShareCode } from "../shared/catalog";
import { reviewChecks } from "../shared/adapters";
import { CLIPBOARD_CLEAR_MS, MIN_PASSWORD, WSOL } from "../shared/constants";
import { formatAmount, shortAddress } from "../shared/format";
import type { CreateWalletPreview } from "../shared/messages";
import { passwordScore } from "../shared/security";
import { Mark, TokenAvatar } from "./brand";
import {
  IconBack,
  IconClock,
  IconCopy,
  IconEye,
  IconGear,
  IconGrid,
  IconHome,
  IconLock,
  IconReceive,
  IconSend,
} from "./icons";
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
  const [autoLock, setAutoLock] = useState("15");
  const [stdName, setStdName] = useState("");
  const [stdProgram, setStdProgram] = useState("");
  const [stdKind, setStdKind] = useState<StandardKind>("custom");
  const [stdWidth, setStdWidth] = useState<AmountWidth>("u128");
  const [tokSymbol, setTokSymbol] = useState("");
  const [tokName, setTokName] = useState("");
  const [tokMint, setTokMint] = useState("");
  const [tokDecimals, setTokDecimals] = useState("9");
  const [tokStandard, setTokStandard] = useState("spl-token");
  const [shareCode, setShareCode] = useState("");
  const [exportPw, setExportPw] = useState("");
  const [exported, setExported] = useState<string>();
  const [exportReveal, setExportReveal] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [solUsd, setSolUsd] = useState<number>();

  const load = useCallback(async (next?: View) => {
    const fresh = await call<PublicWalletState>({ type: "GET_STATE" });
    setState(fresh);
    setRpcUrl(fresh.rpcUrl);
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
    void fetch(`https://lite-api.jup.ag/price/v2?ids=${WSOL}`)
      .then((res) => res.json())
      .then((json: { data?: Record<string, { price?: string | number }> }) => {
        const price = Number(json.data?.[WSOL]?.price);
        if (Number.isFinite(price) && price > 0) setSolUsd(price);
      })
      .catch(() => undefined);
  }, []);

  const sol = state?.balances.find((b) => b.nativeSol);
  const listed = useMemo(() => {
    if (!state) return [];
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
    for (const token of state.balances) {
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
            <Mark size={44} />
          </div>
          <p className="lede">Loading…</p>
        </div>
      </div>
    );
  }

  const unlockedNav = state.unlocked && ["home", "send", "review", "receive", "activity", "standards", "settings"].includes(view);
  const strength = passwordScore(password);

  return (
    <div className={`shell${view === "unlock" || view === "welcome" || view === "import" ? " locked" : ""}`}>
      {toast ? <div className="toast">{toast}</div> : null}
      {error ? <p className="notice alert">{error}</p> : null}

      {view === "welcome" ? (
        <div className="center stack">
          <div className="logo-wrap">
            <Mark size={44} />
          </div>
          <h1 className="welcome">Welcome to Earth</h1>
          <p className="lede">A non-custodial wallet for every Solana token standard — including adapters Phantom still ignores.</p>
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
          <p className="lede">Enter your 12 or 24 word secret phrase. It stays on this device.</p>
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
            <Mark size={44} />
          </div>
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
          <div className="header">
            <div className="account">
              <Mark size={28} />
              <div>
                <strong>Account 1</strong>
                <span>{state.networkLabel}</span>
              </div>
            </div>
            <div className="header-actions">
              <button type="button" className="icon-btn" onClick={() => void copyText(state.address ?? "", "Address copied")} title="Copy address">
                <IconCopy />
              </button>
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
          </div>
          <div className="balance-block">
            <p className="usd">
              {portfolioUsd != null
                ? `$${portfolioUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : `${formatAmount(BigInt(sol?.amount ?? "0"), 9, 4)} SOL`}
            </p>
            <p className="sub">{shortAddress(state.address ?? "", 4)}</p>
          </div>
          <div className="actions">
            <button
              type="button"
              className="action"
              onClick={() => {
                setSelected(sol);
                setAmount("");
                setTo("");
                setView("send");
              }}
            >
              <i>
                <IconSend />
              </i>
              Send
            </button>
            <button type="button" className="action" onClick={() => setView("receive")}>
              <i>
                <IconReceive />
              </i>
              Receive
            </button>
            <button type="button" className="action" onClick={() => void copyText(state.address ?? "", "Address copied")}>
              <i>
                <IconCopy />
              </i>
              Copy
            </button>
            <button
              type="button"
              className="action"
              onClick={() =>
                void run(async () => {
                  await call({ type: "REFRESH" });
                  await load("home");
                })
              }
            >
              <i>
                <IconClock />
              </i>
              Refresh
            </button>
          </div>
          <div className="tabs">
            <button type="button" className="active">
              Tokens
            </button>
          </div>
          <div className="grow">
            {listed.map((token) => (
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
                      {(Number(formatAmount(BigInt(token.amount), token.decimals, 8)) * solUsd).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </small>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
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
          <p className="sub" style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
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
            <input value={to} placeholder="Address or .sol later" autoCorrect="off" spellCheck={false} onChange={(e) => setTo(e.target.value)} />
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
            Register a program, or paste a share code from the Earth site so you can hold tokens minted on someone
            else&apos;s standard.
          </p>
          <label>
            Adopt from share code
            <input value={shareCode} onChange={(e) => setShareCode(e.target.value)} placeholder="Paste from Earth → Copy link" />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={busy || !shareCode.trim()}
            onClick={() =>
              void run(async () => {
                const row = decodeShareCode(shareCode);
                await call({
                  type: "ADOPT_STANDARD",
                  id: row.id,
                  name: row.name,
                  programId: row.programId,
                  kind: row.kind,
                  amountWidth: row.amountWidth,
                  notes: row.notes,
                });
                setShareCode("");
                setTokStandard(row.id);
                await load("standards");
              })
            }
          >
            Add published standard
          </button>
          <label>
            Name
            <input value={stdName} onChange={(e) => setStdName(e.target.value)} placeholder="Meridian" />
          </label>
          <label>
            Program ID
            <input value={stdProgram} onChange={(e) => setStdProgram(e.target.value)} placeholder="On-chain program" />
          </label>
          <div className="row">
            <label>
              Kind
              <select value={stdKind} onChange={(e) => setStdKind(e.target.value as StandardKind)}>
                <option value="custom">custom</option>
                <option value="token-2022">token-2022</option>
                <option value="spl-token">spl-token</option>
              </select>
            </label>
            <label>
              Width
              <select value={stdWidth} onChange={(e) => setStdWidth(e.target.value as AmountWidth)}>
                <option value="u128">u128</option>
                <option value="u64">u64</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({
                  type: "REGISTER_STANDARD",
                  name: stdName,
                  programId: stdProgram,
                  kind: stdKind,
                  amountWidth: stdWidth,
                });
                setStdName("");
                setStdProgram("");
                await load("standards");
              })
            }
          >
            Add standard
          </button>
          <label>
            List a mint on
            <select value={tokStandard} onChange={(e) => setTokStandard(e.target.value)}>
              {state.standards.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ticker
            <input value={tokSymbol} onChange={(e) => setTokSymbol(e.target.value)} />
          </label>
          <label>
            Name
            <input value={tokName} onChange={(e) => setTokName(e.target.value)} />
          </label>
          <label>
            Mint (optional)
            <input value={tokMint} onChange={(e) => setTokMint(e.target.value)} placeholder="Blank = preview mint" />
          </label>
          <label>
            Decimals
            <input value={tokDecimals} onChange={(e) => setTokDecimals(e.target.value)} />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call({
                  type: "ADD_TOKEN",
                  standardId: tokStandard,
                  symbol: tokSymbol,
                  name: tokName,
                  mint: tokMint,
                  decimals: Number(tokDecimals),
                });
                setTokSymbol("");
                setTokName("");
                setTokMint("");
                await load("standards");
              })
            }
          >
            List token
          </button>
          {state.standards.map((standard) => (
            <article key={standard.id} className="notice stack">
              <div className="header" style={{ margin: 0 }}>
                <strong>{standard.name}</strong>
                <span className="pill">{standard.amountWidth}</span>
              </div>
              {reviewChecks(standard).slice(0, 1).map((check) => (
                <span key={check} className="pill warn">
                  {check}
                </span>
              ))}
              {standard.userCreated ? (
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
            <IconHome />
            Home
          </button>
          <button type="button" className={view === "activity" ? "active" : ""} onClick={() => setView("activity")}>
            <IconClock />
            Activity
          </button>
          <button type="button" className={view === "standards" ? "active" : ""} onClick={() => setView("standards")}>
            <IconGrid />
            Standards
          </button>
          <button type="button" className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <IconGear />
            Settings
          </button>
        </nav>
      ) : null}
    </div>
  );
}
