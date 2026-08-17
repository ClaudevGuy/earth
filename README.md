# Earth

Solana AMM. Token standards are adapters: SPL Token and Token-2022 are native; anything else (including `u128` amounts) can be registered and pooled on Earth.

Netlify hosts the web app. Earth is the DEX for those standards. Pools and the launchpad settle on-chain through per-pool vaults that Earth coordinates. Factory contracts mint real SPL / Token-2022 tokens into Earth Wallet. Aggregation across other venues comes later.

## What it is

- **DEX** — swap any two listed tokens on Earth pools (CPMM, stable, two-hop)
- **Trade** — terminal: candles, AMM depth, buy/sell on Earth pools and launchpad coins
- **Launchpad** — mint a coin on a live standard into a curve vault; graduates into a locked Earth pool
- **Pools** — Earth pools users create (shared across the site)
- **Liquidity** — create a pool; deposits move tokens into the pool vault
- **Standards** — create a contract on an Earth factory (variables only — including Mandate), or upload public contract source and burn $1,000 of $EARTH for a new standard
- **Docs** — in-app user guide (same material as `docs/`)
- **Indexer** — prices Earth pools from reserves; optional external market caps for SPL mints via `/api/mcaps`; RPC proxy at `/api/rpc`; public standard catalog at `/api/standards`

Earth does **not** stamp unknown programs as safe. Unverified means allowlisted in this UI, not audited.

## User guide

Full walkthroughs (create a standard, register/upload it, list and mint tokens, open pools, how LP math works, Earth Wallet):

- In the app: **Docs**
- In the repo: [docs/README.md](docs/README.md)

## Earth Wallet (Chrome extension)

Earth Wallet is the companion extension: it holds keys locally and speaks every adapter the market can register — SPL Token, Token-2022 (including extensions), and custom programs with u64 or u128 amounts.

```bash
npm install
npm run ext:pack
```

- Load unpacked: Chrome → `chrome://extensions` → Developer mode → Load unpacked → `earth-wallet/`
- Store upload: `earth-wallet.zip` plus the listing copy in `extension/CHROME_STORE.md`
- Privacy policy (required by the store): deploy this web app and use `https://<your-site>/privacy.html`

The web app connects **Earth Wallet only**. Other injected wallets are not offered.

## Local

```bash
npm install
npm run dev
```

Open http://localhost:5173/

## Netlify

1. Push this repo and import it in Netlify (build `npm run build`, publish `dist`).
2. Optional env:
   - `SOLANA_RPC_URL` — used by `/api/rpc` and Earth vault settlement
   - `VITE_RPC_URL` — browser RPC fallback in local dev
   - `VITE_EARTH_MINT` — $EARTH mint once the token is live (listing a custom standard burns $1,000 of $EARTH)

## Honest limits

Wallets that only speak SPL/Token-2022 will not show a custom `u128` adapter. **Earth Wallet** does.
