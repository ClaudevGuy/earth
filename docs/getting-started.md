# Getting started

## What Earth is

Earth is three things that share one adapter model:

1. **A market** — DEX (swap), Trade (terminal), launchpad, pools, and liquidity.
2. **A registry** — you upload public token-contract source, name a token standard, Earth deploys the program (you burn $1,000 of $EARTH), you create contracts on it, and Earth will quote and pool them.
3. **A wallet** — Earth Wallet is a Chrome extension that can hold SPL, Token-2022, *and* custom adapters, including `u128` amounts other wallets still reject.

Netlify hosts the web app. Earth is the DEX. Pools and the launchpad settle on-chain through shared vaults. See [Limits and safety](limits.md).

## Native vs custom

| Standard | Kind | Amount width | Where it already works |
| --- | --- | --- | --- |
| SPL Token | native | `u64` | Earth Wallet, most Solana apps |
| Token-2022 | native | `u64` | Wallets and venues that added Token-2022 |
| Your program | custom | `u64` or `u128` | Earth app + Earth Wallet, once registered |

Earth ships nine **factory** standards. For an AI-agent token: **Standards → Create a contract → Mandate (TSxxx5)** — not Launchpad, not Create a standard. Kernel / Proxy / Flash / Chamber cover Ethereum-style precompiles, upgradeable proxies, flash loans, and DAOs. There is no Launch curve factory. Details: [Mandate](mandate.md), [Factory standards](factory-standards.md). Fair launches with virtual liquidity live on **Launchpad**.

## First 10 minutes

1. Open Earth and **Connect Earth Wallet**. You need a wallet to mint, swap, or LP. If the extension is missing, use **Install Earth Wallet** in the header.
2. Open **DEX** to swap two listed tokens. Open **Trade** for the chart terminal — Earth pools and launchpad coins on the curve. If both lists are empty, create a pool under **Liquidity** or launch a coin.
3. For an AI-agent token: **Standards → Create a contract → Mandate**. For a fair launch: **Launchpad**. To publish a new program: **Standards → Create a standard**. Details: [Mandate](mandate.md), [Launchpad](launchpad.md), [Token standards](token-standards.md), and [Factory standards](factory-standards.md).
4. Open **Liquidity** to add a second pair, or add more size to an existing pool. Details: [Liquidity pools](liquidity.md).
5. Set up the extension if you have not: [Earth Wallet](wallet.md).

## The tabs

| Tab | Use it to |
| --- | --- |
| **DEX** | Swap any two listed tokens on Earth pools |
| **Trade** | Chart, depth, tape, and buy/sell — pools and launchpad coins |
| **Launchpad** | Create a coin on a live standard with virtual SOL liquidity; graduate into an Earth pool |
| **Pools** | See every pool, reserves, indexed USD, fee, and which standards sit on each side |
| **Liquidity** | Create a new pool or add/withdraw LP on an existing pair |
| **Standards** | Create a contract on an Earth factory, burn $1,000 of $EARTH for a new standard (source is public), find others’ standards |
| **Docs** | This guide, in the app |

## What is stored where

- **Web app state** caches in this browser’s `localStorage`. The live book is the shared market at `/api/market`. Clearing site data does not unwind on-chain vaults.
- **Published standards** go to the Earth catalog (`/api/standards`) so other users on this deployment can browse them. A **Copy link** share code still works if the catalog is local-only.
- **Earth Wallet** stores an encrypted vault in the Chrome profile. The seed never leaves the device.
- **On-chain** SPL / Token-2022 balances come from RPC when a wallet is connected. Factory mints created on Earth are on-chain. Custom adapters without a live program ID stay at zero in the wallet.

## Honest one-liner

Registering a standard on Earth **allowlists it in this UI**. It is not an audit and not a listing on other venues until those products add the same adapter.
