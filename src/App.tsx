import { useMemo, useState } from "react";
import type { Page, PairFocus } from "./types";
import { useEarth } from "./useEarth";
import { useIndexer } from "./indexer/useIndexer.ts";
import { TradeView } from "./components/TradeView.tsx";
import { SwapView } from "./components/SwapView.tsx";
import { PoolsView } from "./components/PoolsView.tsx";
import { LiquidityView } from "./components/LiquidityView.tsx";
import { LaunchpadView } from "./components/LaunchpadView.tsx";
import { StandardsView } from "./components/StandardsView.tsx";
import { DocsView } from "./components/DocsView.tsx";
import { shortAddress } from "./lib/format.ts";
import { EarthSpin } from "./components/EarthSpin.tsx";
import { Mark } from "./components/Mark.tsx";

const NAV: { id: Page; label: string }[] = [
  { id: "dex", label: "DEX" },
  { id: "trade", label: "Trade" },
  { id: "launchpad", label: "Launchpad" },
  { id: "pools", label: "Pools" },
  { id: "liquidity", label: "Liquidity" },
  { id: "standards", label: "Standards" },
  { id: "docs", label: "Docs" },
];

const PAGES = new Set(NAV.map((item) => item.id));

function inboundStandards() {
  const q = new URLSearchParams(window.location.search);
  const adopt = q.get("adopt") ?? undefined;
  const std = q.get("std") ?? undefined;
  const pageParam = q.get("page");
  const normalized = pageParam === "swap" ? "dex" : pageParam;
  const page = normalized && PAGES.has(normalized as Page) ? (normalized as Page) : undefined;
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
  const [page, setPage] = useState<Page>(() => {
    if (inbound.page) return inbound.page;
    if (inbound.adopt || inbound.std) return "standards";
    return "dex";
  });
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
          <Mark size={38} />
          <div>
            <h1>Earth</h1>
            <p>Solana DEX</p>
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
              Create a token standard: upload the contract source (it is public), burn $1,000 of $EARTH, Earth deploys
              it. Then create a contract, open a pool, and trade with Earth Wallet.
            </p>
          </div>
          <EarthSpin />
        </section>
      ) : page === "dex" ? (
        <section className="hero">
          <div>
            <p className="kicker">DEX</p>
            <h2>Swap any listed standard on Earth.</h2>
            <p className="lede">
              Pick two tokens. Earth quotes its own pools — CPMM, stable, and two-hop. Confirm in Earth Wallet. Charts
              and launchpad coins live under Trade.
            </p>
          </div>
          <div className="stat-row">
            <div className="stat">
              <span>Pools</span>
              <strong>{earth.pools.length}</strong>
            </div>
            <div className="stat">
              <span>On the curve</span>
              <strong>{earth.launches.filter((c) => !c.graduated).length}</strong>
            </div>
            <div className="stat">
              <span>Listed tokens</span>
              <strong>{earth.tokens.length}</strong>
            </div>
            <div className="stat">
              <span>Standards</span>
              <strong>{earth.standards.length}</strong>
            </div>
          </div>
        </section>
      ) : page === "launchpad" ? (
        <section className="hero">
          <div>
            <p className="kicker">Launchpad</p>
            <h2>Create a coin. Trade the curve. Graduate to an Earth pool.</h2>
            <p className="lede">
              Pick a live token standard, set name, ticker, logo, description, and socials. Earth seeds virtual SOL
              liquidity. When the raise fills, remaining tokens and SOL lock into an Earth CPMM pool.
            </p>
          </div>
          <div className="stat-row">
            <div className="stat">
              <span>On the curve</span>
              <strong>{earth.launches.filter((c) => !c.graduated).length}</strong>
            </div>
            <div className="stat">
              <span>Graduated</span>
              <strong>{earth.launches.filter((c) => c.graduated).length}</strong>
            </div>
            <div className="stat">
              <span>Standards</span>
              <strong>{earth.standards.length}</strong>
            </div>
            <div className="stat">
              <span>Listed tokens</span>
              <strong>{earth.tokens.length}</strong>
            </div>
          </div>
        </section>
      ) : page === "standards" ? (
        <section className="hero">
          <div>
            <p className="kicker">Public registry</p>
            <h2>Create a contract. Or burn $EARTH for a new standard.</h2>
            <p className="lede">
              Earth ships nine token factories. Mandate (TSxxx5) is AI-agent native. Kernel, Proxy, Flash, and Chamber
              are the Ethereum special-contract types: precompiles, upgradeable shells, flash credit, and DAO
              governance. Create a contract on a factory — not a new standard, not Launchpad. Want a fair launch with
              virtual liquidity? Use Launchpad. Want your own program? Create a standard, upload source, burn $1,000 of
              $EARTH.
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
            <p className="kicker">Earth</p>
            <h2>One ground for every Solana standard.</h2>
            <p className="lede">
              Create a contract, or burn $1,000 of $EARTH for a new standard Earth deploys for you — including u128
              adapters that SPL venues reject. Swap on the DEX. Chart and fill on Trade, including launchpad coins
              still on the curve.
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
              <span>Indexed contracts</span>
              <strong>{feed.markets.size}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {page === "dex" ? (
        <SwapView
          earth={earth}
          focus={focus}
          feed={feed}
          onOpenTrade={(next) => openPair("trade", next)}
          onOpenLaunchpad={() => setPage("launchpad")}
        />
      ) : null}
      {page === "trade" ? (
        <TradeView
          earth={earth}
          feed={feed}
          focus={focus}
          onAddLiquidity={(next) => openPair("liquidity", next)}
          onOpenLaunchpad={() => setPage("launchpad")}
        />
      ) : null}
      {page === "pools" ? <PoolsView earth={earth} feed={feed} onOpenPair={(next) => openPair("trade", next)} /> : null}
      {page === "liquidity" ? <LiquidityView earth={earth} focus={focus} /> : null}
      {page === "launchpad" ? <LaunchpadView earth={earth} onOpenPair={openPair} /> : null}
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
        Earth is the DEX. Swap listed tokens, chart them on Trade, and launch coins that graduate into Earth pools.
        Factory contracts mint on-chain.{" "}
        <button type="button" className="linkish" onClick={() => setPage("docs")}>
          Read the user guide
        </button>
        .
      </footer>
    </div>
  );
}
