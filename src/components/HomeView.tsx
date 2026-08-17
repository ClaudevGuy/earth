import type { Page } from "../types";
import { EarthSpin } from "./EarthSpin";
import { PathMotif } from "./Motifs";

const PATHS: { page: Page; kicker: string; title: string; body: string }[] = [
  {
    page: "standards",
    kicker: "Standards",
    title: "Any program can be a token.",
    body: "Upload source, burn $1,000 of $EARTH, Earth deploys it. Or create a contract on a factory — Mandate, Kernel, Proxy, Flash, Chamber — without writing a program.",
  },
  {
    page: "launchpad",
    kicker: "Launchpad",
    title: "Fair launch, then a locked pool.",
    body: "Mint a coin on a live standard with virtual SOL. When the raise fills, remaining tokens and SOL lock into an Earth pool. The curve also trades on Trade.",
  },
  {
    page: "dex",
    kicker: "DEX",
    title: "One venue that can pool them.",
    body: "Swap any two listed standards. Earth quotes its own CPMM, stable, and two-hop routes. Charts live under Trade.",
  },
  {
    page: "trade",
    kicker: "Trade",
    title: "The book for Earth and the curve.",
    body: "Chart Earth pools and launchpad coins as TICKER/SOL. Depth, tape, and a ticket that fills on-chain.",
  },
];

const FACTORIES: { id: string; name: string; line: string }[] = [
  { id: "TSxxx5", name: "Mandate", line: "AI-agent native. Treasury, allowlist, caps, cooldown." },
  { id: "TSxxx6", name: "Kernel", line: "Precompile-style syscalls on a token." },
  { id: "TSxxx7", name: "Proxy", line: "Upgradeable shell. Same address, new implementation." },
  { id: "TSxxx8", name: "Flash", line: "Uncollateralized credit, repaid in the same transaction." },
  { id: "TSxxx9", name: "Chamber", line: "DAO: propose, vote, timelock, execute." },
  { id: "TSxxx1", name: "Memecoin", line: "Buy/sell tax, burn, max wallet, anti-snipe." },
  { id: "TSxxx2", name: "Reflect", line: "Each transfer reflects, burns, and funds a treasury." },
  { id: "TSxxx3", name: "Confidential", line: "ZK ElGamal balances. Proofs, not public amounts." },
  { id: "TSxxx4", name: "Vest", line: "Cliff and linear unlock. Optional clawback." },
];

export function HomeView({
  onEnter,
  onOpenStandard,
}: {
  onEnter: (page: Page) => void;
  onOpenStandard: (id: string) => void;
}) {
  return (
    <div className="home">
      <section className="home-hero">
        <div>
          <p className="kicker">Solana · token standards · smart contracts</p>
          <h2>The next generation of token standards on Solana.</h2>
          <p className="lede">
            SPL was one program. Earth treats every standard as an adapter — including 128-bit amounts other wallets
            still reject, and contract types Solana never shipped: AI-agent mandates, upgradeable shells, flash credit,
            DAOs. Then it is the DEX that can actually list them.
          </p>
          <div className="home-cta">
            <button type="button" className="primary" onClick={() => onEnter("dex")}>
              Enter the DEX
            </button>
            <button type="button" className="ghost" onClick={() => onEnter("launchpad")}>
              Launch a coin
            </button>
            <button type="button" className="ghost" onClick={() => onEnter("standards")}>
              Create a standard
            </button>
          </div>
        </div>
        <EarthSpin size={280} />
      </section>

      <section className="home-thesis" aria-label="Why Earth">
        <p>
          Ethereum special-cased precompiles, proxies, flash loans, and DAOs. Solana shipped one token program. Earth
          ships those contract types as factories — and is the venue that can pool, chart, and launch them.
        </p>
      </section>

      <section className="home-paths">
        {PATHS.map((path) => (
          <button key={path.page} type="button" className="home-path" onClick={() => onEnter(path.page)}>
            <span className="home-path-top">
              <span className="kicker">{path.kicker}</span>
              <PathMotif page={path.page} />
            </span>
            <strong>{path.title}</strong>
            <span>{path.body}</span>
          </button>
        ))}
      </section>

      <section className="home-factories">
        <div className="panel-head tight">
          <span>Nine factories. Variables only.</span>
          <button type="button" className="linkish" onClick={() => onEnter("standards")}>
            Open Standards
          </button>
        </div>
        <div className="home-factory-grid">
          {FACTORIES.map((row) => (
            <button key={row.id} type="button" className="home-factory" onClick={() => onOpenStandard(row.id)}>
              <span className="mono muted">{row.id}</span>
              <strong>{row.name}</strong>
              <span>{row.line}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
