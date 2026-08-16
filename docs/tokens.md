# Tokens and minting

On Earth, a **token** is a mint listed on a **standard**. Listing is how you tell the market and the wallet “this ticker exists and uses that program.”

There is no separate “mint factory” screen. You mint-or-list on **Standards**: either while creating a standard, or with **Mint a token** on any standard card — including standards someone else published.

## Two ways to add a token

### 1. First token while creating a standard

On **Standards → Create a standard**, check **Also list my first token now**. Fill ticker, token name, decimals, and optional mint together with the standard. That token is created in the same click as the standard.

You can skip this. A standard does not need a token of yours — other people can mint on it.

### 2. Mint a token on an existing standard (yours or someone else’s)

On a standard card in Browse, click **Mint a token**. This is how you list a ticker on SPL, Token-2022, Meridian, or a custom program you found in the catalog.

| Field | Notes |
| --- | --- |
| **Ticker** | 2–12 letters or numbers, stored uppercase |
| **Decimals** | 0–38; u64 standards cannot use more than 12 |
| **Token name** | Display name; defaults to the ticker if blank |
| **Mint** | Optional. Blank = preview mint. Duplicate mints are rejected. Same ticker cannot be listed twice on the same standard. |

Click **Mint token**. If the token has no pool yet, **Create pool** takes you to Liquidity with SOL as the suggested quote.

## What “mint” means here

| Situation | What to do |
| --- | --- |
| You are designing a new custom token (like Meridian) | Create the standard (or pick an existing public one), leave mint blank, optionally seed a preview pool. You can swap it on Earth immediately in this browser. |
| Someone else published a standard you want to use | Find it under **Standards → Browse**, click **Mint a token**, list your ticker. |
| You already deployed a mint on your program | Paste that mint address when listing. Register the same mint in Earth Wallet so balances can scan. |
| You want a normal SPL or Token-2022 token | Create the mint with the usual Solana tools (`spl-token`, Token-2022 CLI, or your issuer app). Then list that mint on Earth under `spl-token` or `token-2022`. Earth does not replace the official mint instruction. |
| You want Earth Wallet to show a zero balance until supply exists | List the mint anyway. The wallet still shows the row with amount `0`. |

Earth’s on-chain AMM is not deployed yet, so **preview mints are local catalog entries**, not mainnet accounts. When the Earth program and your adapter are live, the same listing fields (program ID + mint + decimals + width) are what vaults and transfers will use.

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

- **Trade** — if any pool includes that mint (chart, depth, buy/sell).
- **Swap** — same pairs via the route board (direct or two-hop).
- **Create pool** — pair it with any other listed token, any standard, including mixing `u64` and `u128`.
- **Earth Wallet → List a mint** — same ticker/mint/decimals so the wallet can display and (once on-chain) send it.

Listing on the website does not mint supply into your wallet. For SPL, you receive tokens when someone transfers them or when you mint with the official program. For custom preview tokens, Earth LP/swap is simulated against local reserves, not against an on-chain token account.
