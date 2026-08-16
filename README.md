# Earth

Solana AMM + aggregator. Token standards are adapters: SPL Token and Token-2022 are native; anything else (including `u128` amounts) can be registered and pooled on Earth.

Netlify hosts the web app. The AMM math, routing, and adapter registry run in the client as **protocol preview**. Reserves persist in the browser until an on-chain Earth program is deployed.

## What it is

- **Trade** — terminal for listed Earth pairs: candles, depth, tape, buy/sell
- **Swap** — quotes Earth CPMM, Earth Stable, two-hop Earth routes, and Jupiter (optional) for SPL pairs
- **Pools** — seeded pairs plus any pools users create
- **Liquidity** — create a pool between any two listed tokens / standards
- **Standards** — create a token program adapter, publish it so others can find it, mint your own ticker on any standard
- **Docs** — in-app user guide (same material as `docs/`)
- **Indexer** — prices Earth pools from reserves; optional Pump.fun mcaps for SPL mints via `/api/mcaps`; RPC proxy at `/api/rpc`; public standard catalog at `/api/standards`

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
   - `SOLANA_RPC_URL` — used by `/api/rpc`
   - `VITE_RPC_URL` — browser RPC fallback in local dev
   - `JUPITER_API_KEY` — extra aggregator venue for SPL / Token-2022

Without a Jupiter key, Earth still routes across its own pools.

## Honest limits

Wallets that only speak SPL/Token-2022 will not show a custom `u128` adapter. **Earth Wallet** does. Jupiter still will not route it until that product adds the same adapter.
