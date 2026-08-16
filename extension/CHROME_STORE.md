# Chrome Web Store listing — Earth Wallet

Build the zip, then upload it at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

```bash
npm install
npm run ext:pack
```

That writes `earth-wallet/` (load unpacked) and `earth-wallet.zip` (store upload). Load unpacked from `chrome://extensions` → Developer mode → Load unpacked → select `earth-wallet`.

## Listing copy

**Name:** Earth Wallet

**Category:** Productivity

**Language:** English

**Short description (132 characters max):**

Non-custodial Solana wallet. Keys stay on your device. SPL, Token-2022, and any token standard you register.

(110 characters)

**Detailed description (paste into the dashboard):**

Earth Wallet is a non-custodial Solana wallet. Your secret recovery phrase is created and encrypted on this device. Earth never holds your keys, never has a copy of your seed, and cannot recover a lost password.

Most Solana wallets only show SPL Token and Token-2022. Earth Wallet is built for every token standard on Earth: native SOL, SPL, Token-2022 (including extensions such as transfer fees, metadata, and non-transferable mints), and any custom program you register — including 128-bit (u128) amounts.

WHAT YOU CAN DO

• Create a new wallet or import an existing 12- or 24-word BIP-39 secret phrase
• Send and receive SOL and tokens, with a review screen before every send
• See balances grouped like a normal wallet, including Token-2022 extensions
• Register a new token standard, adopt one from an Earth share code, and list mints
• Connect to sites through the wallet provider and Wallet Standard
• Approve or reject connect, sign, and send requests — nothing is signed until you say so

HOW KEYS ARE KEPT

• Password-encrypted vault stored only in your Chrome profile (AES-GCM)
• Unlocked keys live in session storage and auto-lock after inactivity
• The wallet locks when your computer locks
• Secret phrase is hidden until you reveal it; copied phrases clear from the clipboard
• Connected sites never receive your seed or password
• You can disconnect any app from Settings

Earth Wallet is not a bank, exchange, or custodian. If you lose your secret phrase and password, your funds cannot be recovered. Never share your phrase. Earth will never ask for it.

This extension injects a wallet provider on websites so dapps can request a connection, the same way other Solana wallets work. You choose which sites to trust.

**Privacy policy URL:** `https://<your-netlify-site>/privacy.html`

Host `public/privacy.html` with the Earth web app, then paste that URL. The store requires a public policy because the extension handles financial data.

## Single purpose

Cryptocurrency wallet for Solana token programs, including user-registered adapters.

## Permission justifications (paste into the dashboard)

- **storage / unlimitedStorage:** Encrypted vault, registered standards, and token metadata cache.
- **alarms:** Auto-lock the vault after inactivity.
- **idle:** Lock immediately when the OS session locks.
- **Host permissions (http/https):** Inject the wallet provider on dapp pages and talk to the Solana RPC URL the user configures.

## Screenshots

Chrome requires at least one **1280×800** or **640×400** PNG. A listing mock is at `extension/store/screenshot-1280.png`. Capture the real popup after load-unpacked (Assets, Standards, approval) for review.

## After upload

1. Pay the one-time developer registration fee if this is a new account.
2. Attach screenshots and the privacy policy URL.
3. Submit for review. Crypto wallets are reviewed more slowly; expect questions about key storage (local, encrypted) and why host permissions are needed (dapp provider injection).
4. Do not upload `earth-wallet.zip` that still contains `node_modules` or source maps. `npm run ext:pack` already zips only the built extension.
