# Tokens and contracts

On Earth, a **token** is a **contract** listed on a **standard**. Listing is how you tell the market and the wallet “this ticker exists and uses that program.”

There is a factory screen for Earth’s five built-in programs. You can also create a contract on **Standards**: while creating a custom standard, or with **Create a contract** on any standard card — including standards someone else published. To launch a coin with virtual liquidity, use **Launchpad**.

## Factory contracts (variables only)

Earth’s five factory standards do not ask for a program ID. Earth already deployed those programs. Open **Standards → Create a contract**. For an AI-agent token, pick **Mandate** (`TSxxx5`) — see [Mandate](mandate.md). Otherwise pick Memecoin, Reflect/burn, Confidential, or Vested lock. See [Factory standards](factory-standards.md). For a public coin with virtual SOL liquidity, open [Launchpad](launchpad.md). There is no Launch curve factory.

## Two ways to add a token

### 1. First contract while creating a standard

On **Standards → Create a standard**, check **Also create my first contract now**. Fill ticker, token name, and decimals together with the standard. That contract is created in the same click as the standard. Earth assigns the contract address.

You can skip this. A standard does not need a token of yours — other people can create contracts on it.

### 2. Create a contract on an existing standard (yours or someone else’s)

On a standard card in Browse, click **Create a contract**. This is how you list a ticker on SPL, Token-2022, Meridian, or a custom program you found in the catalog.

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
| You want a new custom token (like Meridian) | Create the standard (or pick an existing public one). Earth assigns the contract. Optionally seed a preview pool. You can swap it on Earth immediately in this browser. |
| Someone else published a standard you want to use | Find it under **Standards → Browse**, click **Create a contract**, list your ticker. |
| You want a normal SPL or Token-2022 token | Create it with the usual Solana tools, then list that contract address on Earth under `spl-token` or `token-2022`. |
| You want Earth Wallet to show a zero balance until supply exists | List the contract anyway. The wallet still shows the row with amount `0`. |

Earth’s on-chain AMM is not deployed yet, so **preview contracts are local catalog entries**, not mainnet accounts. When Earth programs are live, the same listing fields (Earth-assigned program + contract + decimals + width) are what vaults and transfers will use.

## Decimals and amount width

Amounts are integers of `decimals` fractional digits.

- SPL USDC is 6 decimals in a `u64`.
- Meridian is 18 decimals in a `u128`, because a large 18-decimal supply does not fit `u64`.

If you pick `u64` and more than 12 decimals, registration is rejected. Use `u128`, or fewer decimals.

## Built-in listed tokens

| Symbol | Standard | Role |
| --- | --- | --- |
| SOL | SPL | Native quote, seeded pools |
| USDC / USDT | SPL | Stables; USDC–USDT uses the stable curve |
| BONK, JUP, WIF | SPL | Example SPL names |
| MRD (Meridian) | meridian-u128 | Example custom 18-decimal token |

Your listings get a `user` tag. They persist in this browser until you remove the standard or clear site data. Listings from other users on the same standard live in *their* browsers until the on-chain program is deployed.

## After a token is listed

- **Trade** — if any pool includes that contract (chart, depth, buy/sell).
- **Swap** — same pairs via the route board (direct or two-hop).
- **Create pool** — pair it with any other listed token, any standard, including mixing `u64` and `u128`.
- **Earth Wallet → List a contract** — same ticker / decimals so the wallet can display and (once on-chain) send it.

Listing on the website does not put supply into your wallet. For SPL, you receive tokens when someone transfers them. For custom preview tokens, Earth LP/swap is simulated against local reserves, not against an on-chain token account.
