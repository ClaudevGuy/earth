import { useMemo, useState } from "react";
import type { Page, PairFocus } from "./types";
import { useEarth } from "./useEarth";
import { useIndexer } from "./indexer/useIndexer.ts";
import { TradeView } from "./components/TradeView.tsx";
import { SwapView } from "./components/SwapView.tsx";
import { PoolsView } from "./components/PoolsView.tsx";
import { LiquidityView } from "./components/LiquidityView.tsx";
import { StandardsView } from "./components/StandardsView.tsx";
import { DocsView } from "./components/DocsView.tsx";
import { shortAddress } from "./lib/format.ts";

function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="earthFill" cx="34%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#9bb892" />
          <stop offset="42%" stopColor="#4a828a" />
          <stop offset="100%" stopColor="#1c3a3e" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="16" fill="url(#earthFill)" />
      <circle cx="20" cy="20" r="16.6" stroke="#e09245" strokeWidth="1.15" opacity="0.9" />
      <ellipse cx="20" cy="20" rx="6.4" ry="16" stroke="#f0e2c8" strokeWidth="0.7" opacity="0.28" />
      <path
        d="M4 20h32M20 4c5.6 6.1 8.2 12 8.2 16S25.6 29.9 20 36c-5.6-6.1-8.2-12-8.2-16S14.4 10.1 20 4z"
        stroke="#e4f4f1"
        strokeWidth="0.75"
        opacity="0.4"
      />
      <path
        d="M11.5 15.2c2.2-1.4 4.6-.2 5.8 1.6 1.4 1.8 3.4.8 4.6-1 1.4 2.2 3.8 3.2 2.2 5.2-2.2 1.2-5.2.4-6.4-1.2-1.8-1.4-4.2.1-5.4-1.6.8-1.2 1.2-2.4-.8-3z"
        fill="#d4e2bc"
        opacity="0.42"
      />
    </svg>
  );
}

const NAV: { id: Page; label: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "swap", label: "Swap" },
  { id: "pools", label: "Pools" },
  { id: "liquidity", label: "Liquidity" },
  { id: "standards", label: "Standards" },
  { id: "docs", label: "Docs" },
];

function inboundStandards() {
  const q = new URLSearchParams(window.location.search);
  const adopt = q.get("adopt") ?? undefined;
  const std = q.get("std") ?? undefined;
  const page = q.get("page");
  if (adopt || std || page) {
    const url = new URL(window.location.href);
    window.history.replaceState({}, "", `${url.pathname}${url.hash}`);
  }
  return { adopt, std, page };
}

export default function App() {
  const inbound = useMemo(() => inboundStandards(), []);
  const earth = useEarth();
  const feed = useIndexer(earth.tokens, earth.pools);
  const [page, setPage] = useState<Page>(
    inbound.page === "standards" || inbound.adopt || inbound.std ? "standards" : "trade",
  );
  const [focus, setFocus] = useState<PairFocus>();
  const [docsChapter, setDocsChapter] = useState<string>();

  function openPair(next: Page, nextFocus: PairFocus) {
    setFocus(nextFocus);
    setPage(next);
  }

  return (
    <div className={`shell${page === "trade" ? " terminal-shell" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <h1>Earth</h1>
            <p>Solana market</p>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "active" : ""}
              onClick={() => {
                if (item.id === "docs") setDocsChapter(undefined);
                setPage(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="wallet-cluster">
          <span className={`status-pill${feed.status === "local" ? " warn" : ""}`}>
            <span className="status-dot" />
            indexer {feed.status}
          </span>
          {earth.wallet ? (
            <>
              <span className="wallet-chip mono" title="Earth Wallet">
                <span className="wallet-dot" />
                {shortAddress(earth.wallet, 4)}
              </span>
              <button type="button" className="ghost" onClick={() => void earth.disconnect()}>
                Disconnect
              </button>
            </>
          ) : earth.earthInstalled ? (
            <button type="button" className="wallet-btn" onClick={() => void earth.connect()}>
              Connect Earth Wallet
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setDocsChapter("wallet");
                setPage("docs");
              }}
            >
              Install Earth Wallet
            </button>
          )}
        </div>
      </header>

      {page === "docs" ? (
        <section className="hero docs-hero">
          <div>
            <p className="kicker">User guide</p>
            <h2>How Earth works.</h2>
            <p className="lede">
              Create a token standard, publish it so others can find it, list mints, open a pool, and use Earth Wallet
              — including what is still protocol preview.
            </p>
          </div>
        </section>
      ) : page === "standards" ? (
        <section className="hero">
          <div>
            <p className="kicker">Public registry</p>
            <h2>Make a standard. Let others mint on it.</h2>
            <p className="lede">
              Publish a token program as an adapter. Anyone can find it here and list their own ticker — including u128
              programs SPL venues reject. SPL and Token-2022 stay native.
            </p>
          </div>
          <div className="stat-row">
            <div className="stat">
              <span>Standards</span>
              <strong>{earth.standards.length}</strong>
            </div>
            <div className="stat">
              <span>Catalog</span>
              <strong>{earth.catalog.length}</strong>
            </div>
            <div className="stat">
              <span>Listed tokens</span>
              <strong>{earth.tokens.length}</strong>
            </div>
            <div className="stat">
              <span>Pools</span>
              <strong>{earth.pools.length}</strong>
            </div>
          </div>
        </section>
      ) : page !== "trade" ? (
        <section className="hero">
          <div>
            <p className="kicker">AMM · Aggregator · Adapters</p>
            <h2>One ground for every Solana standard.</h2>
            <p className="lede">
              Register your own token standard, list a mint, and create a pool — including u128 adapters that SPL venues
              reject. SPL and Token-2022 are native. Jupiter is an optional extra venue for SPL pairs. Full walkthroughs
              live under Docs.
            </p>
          </div>
          <div className="stat-row">
            <div className="stat">
              <span>Standards</span>
              <strong>{earth.standards.length}</strong>
            </div>
            <div className="stat">
              <span>Pools</span>
              <strong>{earth.pools.length}</strong>
            </div>
            <div className="stat">
              <span>Listed tokens</span>
              <strong>{earth.tokens.length}</strong>
            </div>
            <div className="stat">
              <span>Indexed mints</span>
              <strong>{feed.markets.size}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {page === "trade" ? (
        <TradeView earth={earth} feed={feed} focus={focus} onAddLiquidity={(next) => openPair("liquidity", next)} />
      ) : null}
      {page === "swap" ? <SwapView earth={earth} focus={focus} feed={feed} /> : null}
      {page === "pools" ? <PoolsView earth={earth} feed={feed} onOpenPair={(next) => openPair("trade", next)} /> : null}
      {page === "liquidity" ? <LiquidityView earth={earth} focus={focus} /> : null}
      {page === "standards" ? (
        <StandardsView earth={earth} onOpenPair={openPair} focusId={inbound.std} adoptCode={inbound.adopt} />
      ) : null}
      {page === "docs" ? <DocsView onOpen={setPage} chapter={docsChapter} /> : null}

      {earth.walletError ? (
        <p className="notice alert" style={{ marginTop: 16 }}>
          Wallet: {earth.walletError}
        </p>
      ) : null}
      {earth.balanceError ? (
        <p className="notice alert" style={{ marginTop: 16 }}>
          RPC: {earth.balanceError}
        </p>
      ) : null}

      <footer className="footer">
        Netlify hosts the app. Earth AMM math runs in the client as protocol preview. The Trade terminal charts Earth
        pool series, shows AMM depth, and fills listed pairs on Earth CPMM / Stable / multi-hop routes. Deploying the
        matching on-chain program is a later step. Published standards live in the Earth catalog so other users can
        find them and mint their own tokens. The indexer prices pools from reserves and optional Pump.fun mcaps.{" "}
        <button type="button" className="linkish" onClick={() => setPage("docs")}>
          Read the user guide
        </button>
        .
      </footer>
    </div>
  );
}
