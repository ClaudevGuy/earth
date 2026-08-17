# Launchpad

Launchpad is how you create a public coin on Earth. It is not a token standard. The coin is minted on a **standard that is already live** — SPL Token, Token-2022, an Earth factory, or any published custom adapter.

## What you do

1. Open **Launchpad → Create a coin**.
2. Paste a Standard ID (`TSxxx1`, `spl-token`, …) or pick from the live list.
3. Set ticker, name, logo, description, and optional website / X / Telegram.
4. Click **Launch coin**.

Earth seeds the coin with **virtual SOL liquidity**. Traders buy and sell against that curve. When **85 SOL** has been raised, remaining tokens plus the raised SOL lock into an Earth constant-product pool. That LP cannot be withdrawn.

## Curve (same for every coin)

| Field | Value |
| --- | --- |
| Total supply | 1,000,000,000 |
| Sold on the curve | 800,000,000 |
| Reserved for the graduated pool | 200,000,000 |
| Virtual SOL | 30 |
| Graduation | 85 SOL raised |
| Launch fee | 1% |

Price comes from the virtual reserves (`virtual SOL / tokens still on the curve`). Virtual SOL is not withdrawable. Only SOL that traders actually put in counts toward graduation.

## After graduation

The coin appears under **Graduated**. Open it on **Trade** as `{TICKER}/SOL`. While it is on the curve it already appears on Trade. Liquidity sits in the Earth pool; it is not an LP position you can pull.

## Factories vs Launchpad

If you pick Mandate, Launchpad uses Mandate’s default variables and sets the operator and allowed ACT destination to the connected Earth Wallet. That is still a Mandate contract (TSxxx5), not a different standard. To set a custom allowlist or caps, create the contract from **Standards → Create a contract → Mandate** instead.

If you pick Memecoin, Reflect/burn, or Chamber, Launchpad applies that factory’s default taxes or treasury levy. Kernel, Proxy, and Flash also launch with their defaults (syscalls on, upgrade delay, flash premium). To change those, create the contract from **Standards**.

Fair launch with virtual liquidity is Launchpad. It is not a factory. There is no Launch curve token standard.

## Live settlement

Buys and sells settle on-chain through the coin’s vault. Graduation locks remaining tokens and raised SOL into an Earth CPMM pool. Connect Earth Wallet before you launch or trade the curve.
