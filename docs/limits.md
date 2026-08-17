# Limits and safety

Read this before you treat Earth as a live venue for real size.

## What is live

The website lists real SPL / Token-2022 mints. Creating a factory contract mints an on-chain token. Creating an Earth pool or buying a launchpad coin moves tokens and SOL into an Earth-coordinated vault. All users share the same market via `/api/market`.

- Earth pool deposits, swaps, and withdrawals move tokens into / out of that pool’s vault.
- Launchpad buys send SOL into the coin’s vault and receive minted tokens from it.
- Factory mints (memecoin, reflect, confidential, vesting, agent) are Token-2022 / SPL mints. Tax is an on-chain transfer fee when the factory defines one.
- Listing a custom token standard will burn $1,000 of $EARTH once `VITE_EARTH_MINT` is set.
- Confidential transfers depend on Solana’s ZK ElGamal proof program, which is disabled on mainnet pending audits.
- Graduated launchpad LP cannot be withdrawn.

## What Earth does not claim

- **Not an audit.** Publishing a standard only allowlists it in this UI / this wallet. The catalog is not a security review.
- **Not a listing on other wallets.** Custom `u128` tokens will not appear there until those products add an adapter.
- **Unverified ≠ safe.** Custom programs may be upgradeable. Check upgrade authority yourself.

## Wallets

- Website connect: **Earth Wallet only** (`window.earth.solana`). Phantom, Solflare, and other injected wallets are ignored.
- Chain balances: RPC (`VITE_RPC_URL` locally, or `/api/rpc` when `SOLANA_RPC_URL` is set). Failures show as an RPC notice.
- Earth Wallet seed and password are unrecoverable if lost. Export seed only on a machine you trust.

## Indexer

- Earth pool prices come from vault reserves.
- Optional external market caps for SPL mints via `/api/mcaps`.
- `indexer local` means no remote mcaps; USD may still appear for tokens priced through SOL/USDC.

## Data that never leaves your machine (web app)

Your extra tokens, pools, and LP positions cache in this browser’s `localStorage` under `earth.v1.*`. The live book is the shared market. Clearing site data does not unwind on-chain vaults.

Publishing a standard (name, public source, Earth-assigned program, kind, amount width, notes, optional connected wallet as publisher) is sent to `/api/standards` so other users can find it and read the code. Uncheck publish to keep a standard only in this browser. Share links encode the public fields in the URL (source is included when it is small enough; otherwise open the catalog card).
