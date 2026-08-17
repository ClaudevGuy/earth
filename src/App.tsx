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
  { id: "trade", label: "Trade" },
  { id: "launchpad", label: "Launchpad" },
  { id: "swap", label: "Swap" },
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
  const page = pageParam && PAGES.has(pageParam as Page) ? (pageParam as Page) : undefined;
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
    return "trade";
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
              Create a token standard: upload the contract source (it is public), burn $1,000 of $EARTH, Earth deploys
              it. Then create a contract, open a pool, and use Earth Wallet — including what is still protocol preview.
            </p>
          </div>
          <EarthSpin />
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
              For an AI-agent token: Standards → Create a contract → click Mandate (TSxxx5). That is a factory contract,
              not a new standard, and not Launchpad. There is no Launch curve factory. The other factories are memecoin,
              reflect/burn, confidential ZK ElGamal, and vested lock. Want a fair launch with virtual liquidity? Use
              Launchpad. Want your own program? Create a standard, upload source, burn $1,000 of $EARTH.
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
              Create a contract, or burn $1,000 of $EARTH for a new standard Earth deploys for you — including u128
              adapters that SPL venues reject. SPL and Token-2022 are native. Jupiter is an optional extra venue for SPL
              pairs. Full walkthroughs live under Docs.
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

      {page === "trade" ? (
        <TradeView earth={earth} feed={feed} focus={focus} onAddLiquidity={(next) => openPair("liquidity", next)} />
      ) : null}
      {page === "swap" ? <SwapView earth={earth} focus={focus} feed={feed} /> : null}
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
        Netlify hosts the app. Earth AMM math runs in the client as protocol preview. The Trade terminal charts Earth
        pool series, shows AMM depth, and fills listed pairs on Earth CPMM / Stable / multi-hop routes. Deploying the
        matching on-chain program is a later step. Published standards live in the Earth catalog so other users can
        find them and mint their own tokens. The indexer prices pools from reserves and optional external market caps.{" "}
        <button type="button" className="linkish" onClick={() => setPage("docs")}>
          Read the user guide
        </button>
        .
      </footer>
    </div>
  );
}
