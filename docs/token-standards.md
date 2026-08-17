# Token standards

A **token standard** is the program that stores and transfers amounts. Earth does not hard-code “only SPL.” It keeps an adapter registry: native programs plus anything Earth deploys for you (or anyone else) after you burn $1,000 of $EARTH.

The **Standards** tab is both a factory and a directory:

1. **Create a contract** — pick an Earth factory, fill the variables, done.
2. **Create a standard** — upload the token contract source (public), pick amount size, burn $1,000 of $EARTH. **Earth deploys the program.** You never paste a program ID.
3. **Browse** — find a published standard and create your own contract on it.

## What you are creating

A standard record has:

| Field | Meaning |
| --- | --- |
| **Standard ID** | Assigned by Earth as `TSxxx1`, `TSxxx2`, `TSxxx3`, … Factories are `TSxxx1`–`TSxxx5`. Each new standard gets the next number. |
| **Name** | Human label, e.g. `Meridian` or `Acme Credits` |
| **Program** | Earth deploys this from the source you uploaded. You burn $1,000 of $EARTH; you do not paste an address. |
| **Source** | Required. The token contract code. Public on the standard card and in the catalog. |
| **Kind** | Always `custom` for standards Earth deploys. SPL Token and Token-2022 are the native rows. |
| **Amount width** | `u64` (SPL-sized) or `u128` (18-decimal supplies that do not fit SPL) |
| **Review** | `native` (Earth-built-in), `registered` (seeded example / factory), or `unverified` (you or someone else burned $EARTH to create it) |

Earth never stamps an unverified program as safe. Unverified means **allowlisted in this UI**, not audited. Earth holds upgrade authority on programs it deploys.

## Find a standard

Open **Standards → Browse standards**.

- Search by name, standard ID, or notes.
- Filter **All / Factories / Custom / Native / Yours**.
- **Public** pills are in the catalog (or seeded, like Meridian). **Yours** are standards you created in this browser.
- **catalog live** means other users on this deployment can see what you publish. **catalog local** means publish is only on this machine — use **Copy link** so someone else can still adopt it.

Paste a share code (or open a shared `?adopt=` link) to add a standard that is not in the catalog yet.

## Create a standard

Open **Standards → Create a standard**.

You are **not** deploying a Solana program yourself. You upload the source; Earth deploys it.

1. **Standard name** — required. Example: `Meridian`.
2. **Amount size**
   - **Large (u128)** for 18-decimal (or larger) supplies. u64 with more than 12 decimals cannot hold a large supply.
   - **Normal (u64)** if you want SPL-sized amounts.
3. **Token contract source** — required. Upload a `.rs` (or `.toml` / `.txt`) file, or paste the program source. This is public: anyone who opens the standard can read it. Binaries and `.so` files are rejected.
4. Optional **notes** — shown to people who find the standard.
5. You burn **$1,000 of $EARTH** (quoted from the live $EARTH price). Earth deploys that source and holds upgrade authority. $EARTH is not live yet, so nothing is taken in this protocol preview. Creating a contract on a factory or on someone else’s standard does not require this burn.
6. Leave **Publish so other users can find this standard** checked (default). Uncheck only if you want it private to this browser — source is still visible on your local card.
7. Optionally check **Also create my first contract now** if you want a ticker in the same click. You can skip this: the point of a standard is that **other people create their own contracts on it later**.
8. Click **Create standard**.

Ticker rules (when you do create a contract): 2–12 letters or numbers. Decimals: 0–38; u64 is capped at 12.

After success, the standard appears in Browse. Use **Copy link** to send it. Use **Create a contract** on the card to list a ticker — yours or, for other users, theirs.

## Create a contract on someone else’s standard

1. Find the standard in Browse (or open their share link).
2. Click **Create a contract**.
3. Fill ticker, name, decimals. On SPL / Token-2022 you may paste an existing contract address; on Earth standards the address is assigned for you.
4. Click **Create contract**.

That listing is *your* token on *their* program. Duplicate contracts are rejected. The same ticker cannot be listed twice on the same standard in this browser. See [Tokens and contracts](tokens.md).

## Earth deploys the program

You upload **source text**, not a ZIP or `.so`. You do not paste a program ID. Creating a standard means **you burn $1,000 of $EARTH, the source is published, and Earth deploys the program** so Earth (and Earth Wallet) know how to read it.

Factory standards already ship their `lib.rs` on the card. Custom standards you create must include source or they will not create.

### Preview (this protocol preview)

Earth assigns a local program handle (`earthprog:…`). Trade and LP locally. Other users can still adopt the preview via the catalog or a share link. Balances on chain stay at zero until Earth deploys for real.

### Live (when on-chain deploy is wired)

The same click burns $1,000 of $EARTH from the connected Earth Wallet. Earth deploys the program and publishes the standard. Others who find it create **real contract addresses** on that program.

If Earth has not deployed yet, Earth Wallet will show a warning and keep custom balances at zero.

## Register the same standard in Earth Wallet

The market and the wallet have **separate** registries. Publishing on the website does not automatically appear in the extension.

In the extension: **Standards** tab.

1. Paste a share code from the site (**Add published standard**). Do not paste a program ID — Earth already assigned it.
2. **List a contract** on that standard (ticker, name, decimals). On SPL / Token-2022 you may paste an existing contract address.

Wallet registration is what lets send/receive and balance scans work. Market registration is what lets swap/LP work.

## Built-in standards

- **SPL Token** — `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, u64, review `native`. Anyone can list an SPL contract on it.
- **Token-2022** — `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, u64, review `native`. Extra extensions (transfer fee, metadata, hooks) are first-class in Earth Wallet.
- **Meridian (u128)** — preview adapter, review `registered`, public in the catalog. Example of 18-decimal amounts that do not fit SPL. Anyone can create a contract on it.
- **Five factories** (review `registered`) — Mandate (`TSxxx5`, AI-agent native; create from **Standards → Create a contract → Mandate**), Memecoin (`TSxxx1`), Reflect/burn (`TSxxx2`), Confidential ZK ElGamal (`TSxxx3`), Vested lock (`TSxxx4`). You only fill variables. There is no Launch curve factory. Details: [Factory standards](factory-standards.md), [Mandate](mandate.md). Fair launches: [Launchpad](launchpad.md).

## After a standard is public

- Anyone can **Create a contract** on it from Browse.
- Create a pool from the token card, or from **Liquidity**.
- Swap if a pool exists.
- Other wallets and Jupiter will **not** see a custom `u128` adapter until they add one. Earth can still quote and LP it.

## Removing a standard

**Remove** on a card you added (created or adopted) deletes locally:

- the standard
- every token you listed on it
- every pool that used those contracts
- your LP shares on those pools

It does **not** unpublish a catalog entry. Other users keep the public standard. Native SPL / Token-2022 and the seeded Meridian row cannot be removed from this UI.
