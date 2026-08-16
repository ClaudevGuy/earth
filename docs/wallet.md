# Earth Wallet

Earth Wallet is a **Chrome extension** so every standard that can be registered on Earth can also be **held, shown, and sent** — including custom `u128` adapters that other wallets still reject.

The market (this website) is the AMM and registry. The wallet is the key manager and adapter-aware account scanner. The site **only connects Earth Wallet**.

## Why a new wallet

Existing Solana wallets speak SPL Token and, increasingly, Token-2022. They assume `u64` amounts and those two program IDs.

Earth’s point is that **anyone can register another program**. If that program stores a 128-bit amount, other wallets will not show it. Earth Wallet:

- Treats SPL, Token-2022, and **registered custom programs** as adapters.
- Scans Token-2022 extensions (transfer fee, frozen, non-transferable, metadata, …) and disables send when it must.
- For a live custom program, scans accounts owned by that program and reads `u64` or `u128` amounts using the layout in [Adapter spec](adapter-spec.md).
- Injects `window.earth.solana` (and Wallet Standard) so this site can **Connect Earth Wallet**.

Keys stay on this device. The vault is encrypted with your password (PBKDF2, 310,000 iterations). Earth cannot recover a lost seed or password.

## Install (developer preview)

From the Earth repo:

```bash
npm install
npm run ext:pack
```

That writes `earth-wallet/` (load unpacked) and `earth-wallet.zip` (Chrome Web Store upload).

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `earth-wallet/`.
2. Pin **Earth Wallet**. Open the popup.

Minimum Chrome 116. Store listing copy and permission justifications: `extension/CHROME_STORE.md`. Privacy policy is served with the web app at `/privacy.html`.

Permissions: `storage`, `alarms`, `unlimitedStorage`, and host access so it can inject the provider and talk to RPC.

## Create a wallet

1. **Create a wallet** — Earth shows a **12-word seed** and a Solana address (path `m/44'/501'/0'/0'`).
2. Write the words down. Earth cannot recover them. Never paste them into a website.
3. Confirm three random words.
4. Choose a password. This encrypts the vault **on this Chrome profile**. It is not your seed, and it is not recoverable.
5. **Encrypt and finish.**

**Import seed phrase** is the same end state from an existing 12-word mnemonic.

## Unlock, lock, auto-lock

- Unlock with the password to see balances.
- Lock from the header or the footer **Lock** control.
- Default auto-lock is **15 minutes** (`Settings`). `0` means never.

## Assets

Home groups tokens **by standard**. SOL is the headline balance. Each row is a mint: amount, decimals, and extension tags when Token-2022 reports them.

- **Receive** — one address for SOL, SPL, Token-2022, and custom adapter accounts owned by you. Copy it.
- **Send** — pick a token. Frozen and non-transferable mints cannot be sent. Token-2022 transfer fees are shown when present.
- Custom adapters **without a live program ID** cannot send on chain. Trade them on Earth, or register a real program ID.

## Standards in the wallet

**Standards** tab (separate from the website Standards tab):

1. Paste a share code from the site, or register a standard (name, program ID, kind, width) — same meaning as on the site. See [Token standards](token-standards.md).
2. **List a mint** so the wallet knows ticker, decimals, and which program to scan.
3. Remove only user-created standards.

If Program ID is not a live Solana address, the wallet warns that balances stay at zero until you deploy. `u128` rows warn that other wallets will not show the adapter.

Meridian is pre-seeded here too, as a preview.

## Connecting to Earth (and other sites)

This website only talks to Earth Wallet. Phantom, Solflare, and other injected providers are ignored.

When you click **Connect Earth Wallet** on the Earth site (or a dapp using Wallet Standard / `window.earth.solana`):

1. Unlock the popup if needed.
2. An **approve** window asks you to connect that origin.
3. Connected sites are listed in **Settings**. **Forget** drops the trust.

Later requests (sign transaction, sign all, sign and send, sign message) each open the same approve window with a short preview. Rejecting throws on the page.

The inpage provider looks like other Solana wallets (`connect`, `disconnect`, `signTransaction`, `signMessage`, `signAndSendTransaction`) and also registers Wallet Standard features.

## Settings

- **Solana RPC** — default mainnet public RPC. Point at your own RPC or at Earth’s `/api/rpc` proxy if you use it.
- **Auto-lock**
- **Connected sites**
- **Export seed** — password required. Treat the words as cash.
- **Refresh balances**

Network label in the header follows the RPC URL (`mainnet` / `devnet` / `testnet`).

## What the wallet does not do yet

- It does not replace the Earth AMM UI. Create pools and swap on the website.
- It does not mint custom tokens by itself. List the mint, then use your program (or Earth preview listing) as described in [Tokens and minting](tokens.md).
- Preview program IDs are not sent to chain. Send will error until you register a real program and the recipient has an account on that program.
- It is not an audit of custom programs you register.
