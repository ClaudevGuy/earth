# Token standards

A **token standard** is a program that defines how amounts are stored and transferred. Earth does not hard-code “only SPL.” It keeps an adapter registry: native programs plus anything you (or anyone else) publish.

The **Standards** tab is both a factory and a directory:

1. **Create a standard** — name a program (kind, amount width, optional program ID).
2. **Publish it** — it lands in the Earth catalog so other users can find it.
3. **Mint on any standard** — list your own ticker on a standard you created *or* one you found.

## What you are creating

A standard record has:

| Field | Meaning |
| --- | --- |
| **Name** | Human label, e.g. `Meridian` or `Acme Credits` |
| **Program ID** | On-chain program address, or blank for a local preview |
| **Kind** | `custom`, `spl-token`, or `token-2022` |
| **Amount width** | `u64` (SPL-sized) or `u128` (18-decimal supplies that do not fit SPL) |
| **Review** | `native` (Earth-built-in), `registered` (seeded example), or `unverified` (you or someone else added it) |

Earth never stamps an unverified program as safe. Unverified means **allowlisted in this UI**, not audited. Custom programs can be upgraded; review upgrade authority yourself.

## Find a standard

Open **Standards → Browse standards**.

- Search by name, program ID, or notes.
- Filter **All / Custom / Native / Yours**.
- **Public** pills are in the catalog (or seeded, like Meridian). **Yours** are standards you created in this browser.
- **catalog live** means other users on this deployment can see what you publish. **catalog local** means publish is only on this machine — use **Copy link** so someone else can still adopt it.

Paste a share code (or open a shared `?adopt=` link) to add a standard that is not in the catalog yet.

## Create a standard

Open **Standards → Create a standard**.

1. **Standard name** — required. Example: `Meridian`.
2. **Program ID** — optional.
   - **Blank** — Earth creates a local preview ID (`earthprog:…`). Use this while you design the adapter. Balances on chain stay at zero until a real program exists.
   - **Filled** — paste the deployed Solana program address. This is how you **upload** a live standard: you are not uploading a file; you are registering the program Earth should speak to.
3. **Kind**
   - `custom` for your own program (default).
   - `spl-token` / `token-2022` if you are pointing at those official programs.
4. **Amount width**
   - `u128` for 18-decimal (or larger) supplies. u64 with more than 12 decimals cannot hold a large supply.
   - `u64` if you are matching SPL layout.
5. Optional **notes** — shown to people who find the standard.
6. Leave **Publish so other users can find this standard** checked (default). Uncheck only if you want it private to this browser.
7. Optionally check **Also list my first token now** if you want a ticker in the same click. You can skip this: the point of a standard is that **other people mint their own tokens on it later**.
8. Click **Create standard**.

Ticker rules (when you do list a token): 2–12 letters or numbers. Decimals: 0–38; u64 is capped at 12.

After success, the standard appears in Browse. Use **Copy link** to send it. Use **Mint a token** on the card to list a ticker — yours or, for other users, theirs.

## Mint a token on someone else’s standard

1. Find the standard in Browse (or open their share link).
2. Click **Mint a token**.
3. Fill ticker, name, decimals, optional mint.
4. Click **Mint token**.

That listing is *your* token on *their* program. Duplicate mints are rejected. The same ticker cannot be listed twice on the same standard in this browser. See [Tokens and minting](tokens.md).

## “Upload” a standard

Earth does not accept a ZIP or `.so` upload in the UI. Upload means **register the program so Earth (and Earth Wallet) know how to read it**.

### Preview (no chain yet)

Leave Program ID blank. Trade and LP locally. Useful for naming, decimals, and pool math before you deploy. Other users can still adopt the preview via the catalog or a share link in this protocol preview.

### Live program (on-chain)

1. Deploy your token program to Solana (devnet or mainnet). Follow [Adapter spec](adapter-spec.md) if it is a custom `u64`/`u128` adapter Earth Wallet should scan.
2. Copy the program ID.
3. In **Create a standard**, paste it into **Program ID**.
4. Set kind `custom` and the amount width your accounts actually use.
5. Publish. Others who find it should list **real mint addresses** on that program.
6. In **Earth Wallet → Standards**, adopt the share code or register the **same** name, program ID, kind, and width so balances can appear in the wallet.

If the program ID is not a real Solana address, Earth Wallet will show a warning and keep custom balances at zero.

## Register the same standard in Earth Wallet

The market and the wallet have **separate** registries. Publishing on the website does not automatically appear in the extension.

In the extension: **Standards** tab.

1. Paste a share code from the site (**Add published standard**), or fill name / program ID / kind / width and **Add standard**.
2. **List a mint** on that standard (ticker, name, mint, decimals). Leave mint blank for a preview mint.

Wallet registration is what lets send/receive and balance scans work. Market registration is what lets swap/LP work.

## Built-in standards

- **SPL Token** — `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, u64, review `native`. Anyone can list an SPL mint on it.
- **Token-2022** — `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, u64, review `native`. Extra extensions (transfer fee, metadata, hooks) are first-class in Earth Wallet.
- **Meridian (u128)** — preview adapter, review `registered`, public in the catalog. Example of 18-decimal amounts that do not fit SPL. Anyone can list their own ticker on it.

## After a standard is public

- Anyone can **Mint a token** on it from Browse.
- Create a pool from the token card, or from **Liquidity**.
- Swap if a pool exists.
- Other wallets and Jupiter will **not** see a custom `u128` adapter until they add one. Earth can still quote and LP it.

## Removing a standard

**Remove** on a card you added (created or adopted) deletes locally:

- the standard
- every token you listed on it
- every pool that used those mints
- your LP shares on those pools

It does **not** unpublish a catalog entry. Other users keep the public standard. Native SPL / Token-2022 and the seeded Meridian row cannot be removed from this UI.
