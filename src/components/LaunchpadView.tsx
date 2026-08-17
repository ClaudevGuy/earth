import { useMemo, useRef, useState } from "react";
import type { EarthState } from "../useEarth";
import type { LaunchpadCoin, ListedToken, PairFocus, TokenSocials, TokenStandard } from "../types";
import { findStandard } from "../adapters/registry";
import { mergeStandards } from "../adapters/catalog";
import { findToken } from "../data/tokens";
import { formatAmount, parseAmount } from "../lib/amounts";
import { formatPrice, formatUsdish, shortAddress } from "../lib/format";
import { readLogoFile } from "../lib/logo";
import { LAUNCH_DEFAULTS, progressBps, spotSolPerToken } from "../launchpad/curve";
import { WSOL } from "../lib/constants";
import { TokenAvatar } from "./TokenAvatar";

type Board = "live" | "graduated" | "create";

function socialsClean(raw: TokenSocials): TokenSocials | undefined {
  const website = raw.website?.trim();
  const twitter = raw.twitter?.trim().replace(/^@/, "");
  const telegram = raw.telegram?.trim().replace(/^@/, "");
  const out: TokenSocials = {};
  if (website) out.website = website;
  if (twitter) out.twitter = twitter;
  if (telegram) out.telegram = telegram;
  return Object.keys(out).length ? out : undefined;
}

function hrefFor(kind: keyof TokenSocials, value: string): string {
  if (kind === "website") return value.startsWith("http") ? value : `https://${value}`;
  if (kind === "twitter") {
    if (value.startsWith("http")) return value;
    return `https://x.com/${value.replace(/^@/, "")}`;
  }
  if (value.startsWith("http")) return value;
  return `https://t.me/${value.replace(/^@/, "")}`;
}

function liveStandards(earth: EarthState): TokenStandard[] {
  return mergeStandards(earth.standards, earth.catalog).filter((s) => s.factory !== "launch");
}

function holdingOf(earth: EarthState, mint: string): bigint {
  const owner = earth.wallet ?? "local";
  const row = earth.launchHoldings.find((h) => h.mint === mint && h.owner === owner);
  return row ? BigInt(row.amount) : 0n;
}

function coinStats(coin: LaunchpadCoin, token: ListedToken) {
  const price = spotSolPerToken(BigInt(coin.virtualSol), BigInt(coin.virtualTokens), token.decimals);
  const supply = Number(parseAmount(LAUNCH_DEFAULTS.totalSupply, token.decimals)) / 10 ** token.decimals;
  const raised = Number(BigInt(coin.realSolRaised)) / 1e9;
  const target = Number(BigInt(coin.graduationSol)) / 1e9;
  const mcap = price * supply;
  const pct = progressBps(BigInt(coin.realSolRaised), BigInt(coin.graduationSol)) / 100;
  return { price, raised, target, mcap, pct };
}

export function LaunchpadView({
  earth,
  onOpenPair,
}: {
  earth: EarthState;
  onOpenPair: (page: "trade" | "liquidity", focus: PairFocus) => void;
}) {
  const [board, setBoard] = useState<Board>("live");
  const [selected, setSelected] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const coins = earth.launches;
  const live = coins.filter((c) => !c.graduated);
  const graduated = coins.filter((c) => c.graduated);
  const picked = coins.find((c) => c.mint === selected);

  function openCoin(mint: string) {
    setSelected(mint);
    setBoard(earth.launches.find((c) => c.mint === mint)?.graduated ? "graduated" : "live");
    setError(undefined);
    setMessage(undefined);
  }

  return (
    <div className="stack">
      <div className="std-tabs">
        {(
          [
            ["live", `On the curve (${live.length})`],
            ["graduated", `Graduated (${graduated.length})`],
            ["create", "Create a coin"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={board === id ? "active" : ""}
            onClick={() => {
              setBoard(id);
              if (id === "create") setSelected(undefined);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="notice alert">{error}</p> : null}
      {message ? <p className="notice">{message}</p> : null}

      {board === "create" ? (
        <CreateLaunch
          earth={earth}
          onError={setError}
          onDone={(mint, note) => {
            setMessage(note);
            setError(undefined);
            openCoin(mint);
          }}
        />
      ) : picked ? (
        <CoinDesk
          earth={earth}
          coin={picked}
          onBack={() => setSelected(undefined)}
          onOpenPair={onOpenPair}
          onError={setError}
          onMessage={setMessage}
        />
      ) : (
        <CoinBoard
          earth={earth}
          coins={board === "live" ? live : graduated}
          empty={
            board === "live"
              ? "No coins on the curve yet. Create one — it mints on-chain with virtual SOL liquidity and graduates into a locked Earth pool."
              : "Nothing has graduated yet. Coins that fill the SOL target move here, with liquidity locked in an Earth CPMM pool."
          }
          onOpen={openCoin}
        />
      )}
    </div>
  );
}

function CoinBoard({
  earth,
  coins,
  empty,
  onOpen,
}: {
  earth: EarthState;
  coins: LaunchpadCoin[];
  empty: string;
  onOpen: (mint: string) => void;
}) {
  if (coins.length === 0) {
    return <p className="notice">{empty}</p>;
  }
  return (
    <div className="launch-grid">
      {coins.map((coin) => {
        const token = findToken(coin.mint, earth.tokens);
        if (!token) return null;
        const std = findStandard(token.standardId, earth.standards);
        const stats = coinStats(coin, token);
        return (
          <button key={coin.id} type="button" className="launch-card" onClick={() => onOpen(coin.mint)}>
            <span className="launch-card-head">
              <TokenAvatar symbol={token.symbol} logo={token.logo} size={44} />
              <span>
                <strong>{token.symbol}</strong>
                <span className="muted">{token.name}</span>
              </span>
              {coin.graduated ? <span className="pill safe">Graduated</span> : <span className="pill">{stats.pct.toFixed(0)}%</span>}
            </span>
            <p className="launch-blurb">{token.description || "No description."}</p>
            <div className="launch-meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, stats.pct)}%` }} />
            </div>
            <div className="launch-meta">
              <span>{formatUsdish(stats.raised)} / {stats.target} SOL</span>
              <span className="mono">{std?.id ?? token.standardId}</span>
            </div>
            <div className="launch-meta">
              <span>{formatPrice(stats.price)} SOL</span>
              <span>MC {formatUsdish(stats.mcap)} SOL</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CreateLaunch({
  earth,
  onDone,
  onError,
}: {
  earth: EarthState;
  onDone: (mint: string, note: string) => void;
  onError: (msg: string) => void;
}) {
  const standards = useMemo(() => liveStandards(earth), [earth.standards, earth.catalog]);
  const [standardId, setStandardId] = useState(standards.find((s) => s.id === "spl-token")?.id ?? standards[0]?.id ?? "");
  const [idDraft, setIdDraft] = useState(standardId);
  const [q, setQ] = useState("");
  const [symbol, setSymbol] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<string>();
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return standards;
    return standards.filter(
      (s) =>
        s.id.toLowerCase().includes(needle) ||
        s.name.toLowerCase().includes(needle) ||
        (s.notes ?? "").toLowerCase().includes(needle),
    );
  }, [q, standards]);

  const picked = findStandard(standardId, standards) ?? standards.find((s) => s.id === standardId);

  function applyId(raw: string) {
    const id = raw.trim();
    setIdDraft(id);
    const match =
      findStandard(id, standards) ??
      standards.find((s) => s.id.toLowerCase() === id.toLowerCase()) ??
      earth.catalog.find((s) => s.id === id);
    if (match) setStandardId(match.id);
  }

  async function onLogo(file?: File) {
    if (!file) return;
    try {
      onError("");
      setLogo(await readLogoFile(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not read that logo.");
    }
  }

  async function launch() {
    onError("");
    setBusy(true);
    try {
      const { token, standard } = await earth.createLaunchCoin({
        standardId,
        symbol,
        name: tokenName,
        description,
        logo,
        socials: socialsClean({ website, twitter, telegram }),
      });
      onDone(
        token.mint,
        `${token.symbol} is live on ${standard.name} (${standard.id}). Buy against the curve until ${LAUNCH_DEFAULTS.graduationSol} SOL is raised — then liquidity locks into an Earth pool.`,
      );
      setSymbol("");
      setTokenName("");
      setDescription("");
      setLogo(undefined);
      setWebsite("");
      setTwitter("");
      setTelegram("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the coin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="swap-grid">
      <aside className="panel pad stack">
        <div className="panel-head">
          <span>Token standard</span>
          <span className="pill">{standards.length} live</span>
        </div>
        <p className="notice">
          The coin is minted on a standard that already exists on Earth. Paste a Standard ID, or pick one below — SPL,
          Token-2022, factories, or any published custom adapter. Earth mints the coin on-chain into a curve vault.
        </p>
        <label>
          Standard ID
          <input
            value={idDraft}
            onChange={(e) => applyId(e.target.value)}
            placeholder="TSxxx1 or spl-token"
          />
        </label>
        <input
          className="search-field"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name or ID"
        />
        <div className="factory-grid launch-std-list">
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`factory-card${standardId === row.id ? " active" : ""}`}
              onClick={() => {
                setStandardId(row.id);
                setIdDraft(row.id);
              }}
            >
              <strong>{row.name}</strong>
              <span className="mono">{row.id}</span>
              <span>
                {row.kind} · {row.amountWidth}
                {row.review === "native" ? " · native" : row.factory ? " · factory" : ""}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="panel pad stack">
        <div className="panel-head">
          <span>New coin{picked ? ` on ${picked.name}` : ""}</span>
          {picked ? <span className="pill">{picked.amountWidth}</span> : null}
        </div>
        <div className="launch-logo-row">
          <button type="button" className="launch-logo-btn" onClick={() => fileRef.current?.click()}>
            {logo ? <img src={logo} alt="" /> : <span>Logo</span>}
          </button>
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Square image, shown on the board and after graduation. Optional, but the board looks empty without it.
            </p>
            <div className="row-actions">
              <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
                Upload logo
              </button>
              {logo ? (
                <button type="button" className="ghost" onClick={() => setLogo(undefined)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onLogo(e.target.files?.[0])}
          />
        </div>
        <div className="form-grid">
          <label>
            Ticker
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="FROG" />
          </label>
          <label>
            Name
            <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Forest Frog" />
          </label>
        </div>
        <label>
          Description
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this coin, in a few sentences."
            maxLength={500}
          />
        </label>
        <div className="form-grid">
          <label>
            Website
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </label>
          <label>
            X / Twitter
            <input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@handle" />
          </label>
        </div>
        <label>
          Telegram
          <input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="t.me/…" />
        </label>
        <div className="fee-callout">
          <strong>Virtual liquidity</strong>
          <span>
            {LAUNCH_DEFAULTS.totalSupply} supply, {LAUNCH_DEFAULTS.tokensOnCurve} sold on a constant-product curve
            seeded with {LAUNCH_DEFAULTS.virtualSol} virtual SOL. {LAUNCH_DEFAULTS.feeBps / 100}% launch fee. At{" "}
            {LAUNCH_DEFAULTS.graduationSol} SOL raised, remaining tokens plus raised SOL lock into an Earth CPMM pool.
            Nobody can pull that LP.
          </span>
        </div>
        <button type="button" className="primary" onClick={() => void launch()} disabled={busy || !standardId}>
          Launch coin
        </button>
      </section>
    </div>
  );
}

function CoinDesk({
  earth,
  coin,
  onBack,
  onOpenPair,
  onError,
  onMessage,
}: {
  earth: EarthState;
  coin: LaunchpadCoin;
  onBack: () => void;
  onOpenPair: (page: "trade" | "liquidity", focus: PairFocus) => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
}) {
  const token = findToken(coin.mint, earth.tokens);
  const std = token ? findStandard(token.standardId, earth.standards) : undefined;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [raw, setRaw] = useState("1");
  const [busy, setBusy] = useState(false);
  const held = holdingOf(earth, coin.mint);

  if (!token) {
    return (
      <p className="notice alert">
        Listing for this coin is missing.{" "}
        <button type="button" className="linkish" onClick={onBack}>
          Back to the board
        </button>
      </p>
    );
  }

  const stats = coinStats(coin, token);
  const socials = token.socials ?? {};
  const listed = token;

  async function trade() {
    onError("");
    onMessage("");
    setBusy(true);
    try {
      const result = await earth.tradeLaunch(coin.mint, side, raw);
      if (result.coin.graduated) {
        onMessage(
          `${listed.symbol} graduated. Raised SOL and remaining tokens are locked in an Earth CPMM pool. Trade it like any other pair.`,
        );
        onOpenPair("trade", { mintA: listed.mint, mintB: WSOL });
        return;
      }
      const out =
        side === "buy"
          ? formatAmount(result.quote.amountOut, listed.decimals)
          : formatAmount(result.quote.amountOut, 9);
      onMessage(
        side === "buy"
          ? `Bought ${out} ${listed.symbol}. ${formatAmount(result.quote.amountIn, 9)} SOL went into the curve.`
          : `Sold ${formatAmount(result.quote.amountIn, listed.decimals)} ${listed.symbol} for ${out} SOL.`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Trade failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="swap-grid">
      <section className="panel pad stack">
        <div className="panel-head">
          <button type="button" className="ghost" onClick={onBack}>
            Board
          </button>
          {coin.graduated ? <span className="pill safe">Graduated</span> : <span className="pill">On the curve</span>}
        </div>
        <div className="launch-desk-head">
          <TokenAvatar symbol={token.symbol} logo={token.logo} size={64} />
          <div>
            <h3 className="launch-title">
              {token.name} <span className="mono">{token.symbol}</span>
            </h3>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {std?.name ?? token.standardId} · <span className="mono">{std?.id ?? token.standardId}</span>
            </p>
          </div>
        </div>
        <p style={{ margin: 0, lineHeight: 1.55 }}>{token.description}</p>
        <div className="row-actions">
          {socials.website ? (
            <a className="ghost" href={hrefFor("website", socials.website)} target="_blank" rel="noreferrer">
              Website
            </a>
          ) : null}
          {socials.twitter ? (
            <a className="ghost" href={hrefFor("twitter", socials.twitter)} target="_blank" rel="noreferrer">
              X
            </a>
          ) : null}
          {socials.telegram ? (
            <a className="ghost" href={hrefFor("telegram", socials.telegram)} target="_blank" rel="noreferrer">
              Telegram
            </a>
          ) : null}
        </div>
        <div className="stat-row">
          <div className="stat">
            <span>Price</span>
            <strong>{formatPrice(stats.price)} SOL</strong>
          </div>
          <div className="stat">
            <span>Market cap</span>
            <strong>{formatUsdish(stats.mcap)} SOL</strong>
          </div>
          <div className="stat">
            <span>Raised</span>
            <strong>
              {formatUsdish(stats.raised)} / {stats.target}
            </strong>
          </div>
          <div className="stat">
            <span>Your bag</span>
            <strong>{formatAmount(held, token.decimals)}</strong>
          </div>
        </div>
        <div className="launch-meter tall" aria-label={`${stats.pct.toFixed(1)} percent to graduation`}>
          <span style={{ width: `${Math.min(100, stats.pct)}%` }} />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {coin.graduated
            ? "Liquidity is locked in the Earth pool. The curve is closed."
            : `${stats.pct.toFixed(1)}% to graduation. Last buys that fill the ${stats.target} SOL target migrate remaining tokens + raised SOL into a locked Earth CPMM pool.`}
        </p>
        <p className="mono muted" style={{ margin: 0, fontSize: 12 }}>
          {shortAddress(token.mint, 8)}
          {coin.creator ? ` · creator ${shortAddress(coin.creator, 4)}` : ""}
        </p>
      </section>
      <aside className="panel pad stack">
        {coin.graduated ? (
          <>
            <div className="panel-head">
              <span>Earth pool</span>
            </div>
            <p className="notice">
              This coin left the curve. Buy and sell on Trade against SOL. LP from graduation is locked — it cannot be
              withdrawn.
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => onOpenPair("trade", { mintA: token.mint, mintB: WSOL })}
            >
              {token.symbol} / SOL on Trade
            </button>
          </>
        ) : (
          <>
            <div className="panel-head">
              <span>Buy / sell</span>
              <span className="pill">{coin.feeBps / 100}% fee</span>
            </div>
            <div className="std-tabs">
              <button type="button" className={side === "buy" ? "active" : ""} onClick={() => setSide("buy")}>
                Buy
              </button>
              <button type="button" className={side === "sell" ? "active" : ""} onClick={() => setSide("sell")}>
                Sell
              </button>
            </div>
            <label>
              {side === "buy" ? "SOL in" : `${token.symbol} in`}
              <input value={raw} onChange={(e) => setRaw(e.target.value)} />
            </label>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Fills settle through the launch vault. The same coin is on Trade as {token.symbol}/SOL while it is on the
              curve.
            </p>
            <button type="button" className="primary" onClick={() => void trade()} disabled={busy}>
              {side === "buy" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => onOpenPair("trade", { mintA: token.mint, mintB: WSOL })}
            >
              Open {token.symbol} / SOL on Trade
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
