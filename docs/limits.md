# Limits and safety

Read this before you treat Earth as a live venue for real size.

## Protocol preview

The website runs complete CPMM + stable math, routing (including two-hop), and an adapter registry **in the client**. Reserves persist in **this browser**. They are not yet vaults on Solana.

Until `programs/` is deployed and the program ID is wired into the UI:

- Swaps, new pools, and LP add/withdraw do not move mainnet tokens.
- Factory mints (memecoin, reflect, confidential, vesting, agent, launch) are preview listings plus local transfer rules.
- Listing a custom token standard will burn $1,000 of $EARTH once the token is live. Preview does not take it yet.
- Confidential transfers depend on Solana’s ZK ElGamal proof program, which is disabled on mainnet pending audits.
- Do not send real assets into a “preview mint.”
- Resetting site data or **Reset seed liquidity** wipes local pools.

## What Earth does not claim

- **Not an audit.** Publishing a standard only allowlists it in this UI / this wallet. The catalog is not a security review.
- **Not a listing on other wallets.** Custom `u128` tokens will not appear there until those products add an adapter.
- **Not Jupiter.** Jupiter is an optional extra venue for SPL / Token-2022 when `JUPITER_API_KEY` is set on Netlify. Custom standards never route there.
- **Unverified ≠ safe.** Custom programs may be upgradeable. Check upgrade authority yourself.

## Wallets

- Website connect: **Earth Wallet only** (`window.earth.solana`). Phantom, Solflare, and other injected wallets are ignored.
- Chain balances: RPC (`VITE_RPC_URL` locally, or `/api/rpc` when `SOLANA_RPC_URL` is set). Failures show as an RPC notice.
- Earth Wallet seed and password are unrecoverable if lost. Export seed only on a machine you trust.

## Indexer

- Earth pool prices come from local reserves.
- Optional external market caps for SPL mints via `/api/mcaps`.
- `indexer local` means no remote mcaps; USD may still appear for tokens priced through SOL/USDC Earth pools.

## Data that never leaves your machine (web app)

Your extra tokens, pools, and LP positions: `localStorage` keys `earth.v1.standards`, `earth.v1.tokens`, `earth.v1.pools`, `earth.v1.lp`.

Publishing a standard (name, public source, Earth-assigned program, kind, amount width, notes, optional connected wallet as publisher) is sent to `/api/standards` so other users can find it and read the code. Uncheck publish to keep a standard only in this browser. Share links encode the public fields in the URL (source is included when it is small enough; otherwise open the catalog card).
