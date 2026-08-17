# Getting started

## What Earth is

Earth is three things that share one adapter model:

1. **A market** — trade terminal, swap, pools, and liquidity for any listed token.
2. **A registry** — you upload public token-contract source, name a token standard, Earth deploys the program (you burn $1,000 of $EARTH), you create contracts on it, and Earth will quote and pool them.
3. **A wallet** — Earth Wallet is a Chrome extension that can hold SPL, Token-2022, *and* custom adapters, including `u128` amounts other wallets still reject.

Netlify hosts the web app. AMM math, routing, and the adapter registry run in the browser as **protocol preview**. Pool reserves live in this browser until the matching on-chain Earth program is deployed. See [Limits and safety](limits.md).

## Native vs custom

| Standard | Kind | Amount width | Where it already works |
| --- | --- | --- | --- |
| SPL Token | native | `u64` | Earth Wallet, Jupiter, most Solana apps |
| Token-2022 | native | `u64` | Wallets and venues that added Token-2022 |
| Your program (example: Meridian) | custom | `u64` or `u128` | Earth app + Earth Wallet, once registered |

**Meridian (MRD)** ships as a built-in example: 18 decimals, `u128` amounts, preview mint, seeded MRD/SOL pool. Earth also ships five **factory** standards. For an AI-agent token: **Standards → Create a contract → Mandate (TSxxx5)** — not Launchpad, not Create a standard. There is no Launch curve factory. Details: [Mandate](mandate.md). Fair launches with virtual liquidity live on **Launchpad**.

## First 10 minutes

1. Open Earth and (optionally) **Connect Earth Wallet**. Connection is for chain balances. Preview trades still run without a wallet. If the extension is missing, use **Install Earth Wallet** in the header.
2. Open **Trade**. The terminal charts an Earth pool, shows AMM depth, and lets you buy or sell the base against the quote. Try SOL/USDC, then **MRD/SOL**. That second pair is a custom `u128` adapter.
3. For an AI-agent token: **Standards → Create a contract → Mandate**. For a fair launch: **Launchpad**. To publish a new program: **Standards → Create a standard**. Details: [Mandate](mandate.md), [Launchpad](launchpad.md), [Token standards](token-standards.md), and [Factory standards](factory-standards.md).
4. Open **Liquidity** to add a second pair, or add more size to an existing pool. Details: [Liquidity pools](liquidity.md).
5. Set up the extension if you have not: [Earth Wallet](wallet.md).

## The tabs

| Tab | Use it to |
| --- | --- |
| **Trade** | Chart, depth, tape, and buy/sell ticket against an Earth pool |
| **Swap** | Compare Earth CPMM, Earth Stable, two-hop, and optional Jupiter routes |
| **Pools** | See every pool, reserves, indexed USD, fee, and which standards sit on each side |
| **Liquidity** | Create a new pool or add/withdraw LP on an existing pair |
| **Launchpad** | Create a coin on a live standard with virtual SOL liquidity; graduate into an Earth pool |
| **Standards** | Create a contract on an Earth factory, burn $1,000 of $EARTH for a new standard (source is public), find others’ standards |
| **Docs** | This guide, in the app |

## What is stored where

- **Web app state** (your standards, listed tokens, pools, LP shares) is in this browser’s `localStorage` under `earth.v1.*`. Clearing site data resets it. **Reset seed liquidity** on Pools restores the built-in demo pools only.
- **Published standards** go to the Earth catalog (`/api/standards`) so other users on this deployment can browse them. A **Copy link** share code still works if the catalog is local-only.
- **Earth Wallet** stores an encrypted vault in the Chrome profile. The seed never leaves the device.
- **On-chain** SPL / Token-2022 balances come from RPC when a wallet is connected. Custom preview mints have no chain accounts yet.

## Honest one-liner

Registering a standard on Earth **allowlists it in this UI**. It is not an audit and not a listing on Jupiter until that product adds the same adapter.
