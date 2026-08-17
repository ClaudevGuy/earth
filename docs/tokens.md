# Tokens and contracts

On Earth, a **token** is a **contract** listed on a **standard**. Listing is how you tell the market and the wallet “this ticker exists and uses that program.”

There is a factory screen for Earth’s nine built-in programs. You can also create a contract on **Standards**: while creating a custom standard, or with **Create a contract** on any standard card — including standards someone else published. To launch a coin with virtual liquidity, use **Launchpad**.

## Factory contracts (variables only)

Earth’s nine factory standards do not ask for a program ID. Earth already deployed those programs. Open **Standards → Create a contract**. For an AI-agent token, pick **Mandate** (`TSxxx5`) — see [Mandate](mandate.md). Kernel, Proxy, Flash, and Chamber are the precompile, upgradeable-proxy, flash-loan, and DAO factories. Otherwise pick Memecoin, Reflect/burn, Confidential, or Vested lock. See [Factory standards](factory-standards.md). For a public coin with virtual SOL liquidity, open [Launchpad](launchpad.md). There is no Launch curve factory.

## Two ways to add a token

### 1. First contract while creating a standard

On **Standards → Create a standard**, check **Also create my first contract now**. Fill ticker, token name, and decimals together with the standard. That contract is created in the same click as the standard. Earth assigns the contract address.

You can skip this. A standard does not need a token of yours — other people can create contracts on it.

### 2. Create a contract on an existing standard (yours or someone else’s)

On a standard card in Browse, click **Create a contract**. This is how you list a ticker on SPL, Token-2022, a factory, or a custom program you found in the catalog.

| Field | Notes |
| --- | --- |
| **Ticker** | 2–12 letters or numbers, stored uppercase |
| **Decimals** | 0–38; u64 standards cannot use more than 12 |
| **Token name** | Display name; defaults to the ticker if blank |
| **Contract address** | Only for SPL / Token-2022, and optional. Blank = Earth assigns one. Duplicate contracts are rejected. Same ticker cannot be listed twice on the same standard. |

Click **Create contract**. If the token has no pool yet, **Create pool** takes you to Liquidity with SOL as the suggested quote.

## What “contract” means here

On Solana this is often called a mint. Earth says **contract** so it matches what people already know.

| Situation | What to do |
| --- | --- |
| You want a new factory or custom token | Create the standard (or pick an existing public one). Earth assigns the contract and, for factories, mints on-chain into Earth Wallet. Open a pool under Liquidity when you want a market. |
| Someone else published a standard you want to use | Find it under **Standards → Browse**, click **Create a contract**, list your ticker. |
| You want a normal SPL or Token-2022 token | Create it with the usual Solana tools, then list that contract address on Earth under `spl-token` or `token-2022`. |
| You want Earth Wallet to show a zero balance until supply exists | List the contract anyway. The wallet still shows the row with amount `0`. |

Factory create mints on-chain into Earth Wallet. Earth pools settle through vaults the site coordinates. The on-chain AMM program (CPI into adapters) is the next deploy; until then vault settlement is the live book.

## Decimals and amount width

Amounts are integers of `decimals` fractional digits.

- SPL USDC is 6 decimals in a `u64`.
- A custom `u128` adapter can use 18 decimals, because a large 18-decimal supply does not fit `u64`.

If you pick `u64` and more than 12 decimals, registration is rejected. Use `u128`, or fewer decimals.

## Built-in listed tokens

| Symbol | Standard | Role |
| --- | --- | --- |
| SOL | SPL | Native quote |
| USDC / USDT | SPL | Stables; a USDC–USDT Earth pool can use the stable curve |
| BONK, JUP, WIF | SPL | Listed SPL names you can pool on Earth |

Your listings get a `user` tag. The live book (tokens, pools, launches) is shared at `/api/market`. Clearing this browser’s cache does not unwind on-chain vaults.

## After a token is listed

- **DEX** — swap the pair if a pool exists (direct or two-hop).
- **Trade** — chart and buy/sell if a pool exists, or if the ticker is still on the launchpad curve.
- **Create pool** — pair it with any other listed token, any standard, including mixing `u64` and `u128`.
- **Earth Wallet → List a contract** — same ticker / decimals so the wallet can display and (once on-chain) send it.

Listing on the website does not by itself put supply into your wallet. Factory create mints on-chain into Earth Wallet. For an existing SPL mint you receive tokens when someone transfers them. Earth pool deposits, swaps, and withdrawals move tokens through the pool vault.
