# Mandate — AI-agent token standard (TSxxx5)

Mandate is Earth’s **AI-agent native factory**. You do **not** write a program. You do **not** upload source. You do **not** use Launchpad. You create a **contract on the existing Mandate factory**.

| You want | Click this | Do not click |
| --- | --- | --- |
| An AI-agent token | **Standards → Create a contract → Mandate (TSxxx5)** | Launchpad; Create a standard; Launch curve |
| A taxed meme coin | Standards → Create a contract → Memecoin | Mandate |
| A fair launch with virtual SOL | **Launchpad** | Standards |
| Your own token program | Standards → Create a standard (upload source, burn $1,000 of $EARTH) | Mandate |

There is **no Launch curve factory**. That catalog row was a leftover name for Launchpad. TSxxx5 is Mandate.

## Create a Mandate contract (exact clicks)

1. Open Earth.
2. Click **Standards** in the header.
3. Click **Create a contract** (the factory screen). Not **Create a standard**. Not **Launchpad**.
4. Click the first card: **Mandate** / `TSxxx5`.
5. Fill **Ticker** (2–12 letters or numbers, stored uppercase). Example: `AGT`.
6. Fill **Token name** if you want a display name. Blank uses the ticker.
7. Leave **Decimals** at `6` unless you have a reason to change it (0–12; Mandate is `u64`).
8. Fill the Mandate variables below. Red fields are required.
9. Optionally check **Create a pool now** if you want an Earth pool in the same click.
10. Click **Create contract**.

Earth assigns the contract address. Kind (`custom`) and amount width (`u64`) are fixed. You never paste a program ID.

If **Allowed ACT destination 1** is blank and Earth Wallet is connected, Earth fills it with that wallet. If no wallet is connected, you must paste a Solana address or create will fail.

## What each field does (and what the program checks)

English in **Mandate (human policy)** is **hashed**, not interpreted. The program does not read that sentence. These fields are what it actually enforces:

| Field on the form | On-chain? | Rule |
| --- | --- | --- |
| Total supply | Yes (first mint) | Whole tokens at create. Endowment is taken from this first mint. |
| Agent levy (bps) | **Yes** | Every transfer credits this share of the amount to the agent treasury. `100` = 1%. Max `2500` (25%). |
| Endowment (bps of supply) | **Yes** | Share of the **first** mint that seeds the treasury. `1000` = 10%. Max `5000` (50%). Levy and endowment cannot both be `0`. |
| Epoch spend cap (bps of treasury) | **Yes** | Max the operator can `act` in one epoch. `500` = 5%. Resets every epoch. |
| Epoch (hours) | **Yes** | Hours between epoch resets. `24` = daily. Min `1`, max `168`. |
| Max single ACT (bps of treasury) | **Yes** | One `act` cannot exceed this share. `200` = 2%. Applies **in addition to** the epoch cap. Both must pass. |
| Cooldown between ACTs (hours) | **Yes** | Minimum hours between two `act`s. `0` = none. `1` = at most one `act` per hour. |
| Operator pubkey | **Yes** | The only key that can sign `act`. Blank = connected Earth Wallet. This is the off-chain agent process, not model weights. |
| Allowed ACT destination 1 | **Yes (required)** | `act` may credit a **token account owned by this wallet** only. Paste a wallet pubkey, not a mint, not a token account. |
| Allowed ACT destination 2 / 3 | **Yes (optional)** | Up to three owners. Must be unique. |
| Mandate (human policy) | Hash only | 8–512 characters. Stored as a 32-byte hash. Off-chain agents should follow it; the program will not parse it. |

`act` fails if any of these is true: operator is not the signer; `act` is paused; destination owner is not on the allowlist; amount is above the per-ACT cap; amount would exceed the epoch cap; cooldown has not elapsed; treasury is too small.

Holder **transfers** still work while `act` is paused. The levy still funds the treasury.

## After it is created

- The token is listed on Mandate (`TSxxx5`) in this browser.
- Earth quotes apply the levy: the number you see on Swap/Trade is what the trader receives.
- Lock mint / freeze / metadata from **Standards → Lock** if you want Trade to mark it Safe.
- Create a pool from the token card or Liquidity if you skipped that at create.
- **Earth Wallet → Standards** already includes Mandate. **List a contract** with the same ticker and decimals so the wallet can show it. The wallet will **send transfers**. It will **not** run the model or submit `act`.

## What stays off-chain (on purpose)

The model, prompts, tools, and “when to spend” live off-chain. Solana cannot run an LLM. The path to more on-chain is **more enforceable rules** (allowlist, caps, cooldown), not putting ChatGPT in `lib.rs`.

To run the agent later: a process that holds the **operator** key watches the treasury and submits `act` (discriminator `3`) to an allowlisted destination. Earth does not host that process.

## Common mistakes

| Mistake | What to do instead |
| --- | --- |
| Looking for **Launch curve** | That row is removed. TSxxx5 is Mandate. |
| Using **Launchpad** | Launchpad is a bonding curve for any live standard. It is not the agent factory. You *may* launch a Mandate ticker there; that still uses Mandate’s default variables, including allowlist = connected wallet. |
| Using **Create a standard** and pasting model code | That publishes a new program (TSxxx6+) and burns $1,000 of $EARTH. Mandate already exists. |
| Pasting a mint or token-account into allowlist | Paste the **wallet pubkey** that will own the receiving token account. |
| Expecting the website to chat or trade by itself | Earth will not run the operator. Caps and allowlist are the on-chain body. |
| Setting levy `0` and endowment `0` | Create fails. The treasury needs a funding path. |
| Duplicate allowlist addresses | Create fails. Destinations must be unique. |

Source: `programs/agent`. Adapter layout: [Adapter spec](adapter-spec.md). Other factories: [Factory standards](factory-standards.md).
