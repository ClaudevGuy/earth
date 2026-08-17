import type { Page } from "../types";

/** In-app user guide — same material as docs/. */

export type DocsCallout = "info" | "warn";

export type DocsBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "callout"; kind: DocsCallout; text: string }
  | { type: "action"; page: Page; label: string };

export interface DocsChapter {
  id: string;
  title: string;
  blurb: string;
  blocks: DocsBlock[];
}

export const DOCS: DocsChapter[] = [
  {
    id: "start",
    title: "Getting started",
    blurb: "What Earth is, what is preview, and where to click first.",
    blocks: [
      {
        type: "p",
        text: "Earth is a Solana market that treats token standards as adapters. SPL Token and Token-2022 are native. Anything else — including 128-bit amounts SPL cannot hold — can be registered, listed, and pooled here.",
      },
      {
        type: "ul",
        items: [
          "A market: trade terminal, swap, pools, and liquidity for any listed token.",
          "A registry: you upload public contract source, burn $1,000 of $EARTH, Earth deploys the program, you create contracts on it, and Earth quotes and pools them.",
          "A wallet: Earth Wallet holds SPL, Token-2022, and custom adapters, including u128 amounts other wallets still reject.",
        ],
      },
      {
        type: "callout",
        kind: "warn",
        text: "AMM math runs in this browser as protocol preview. Pool reserves persist locally until the matching on-chain Earth program is deployed. Registering a standard allowlists it in this UI — it is not an audit, and not a Jupiter listing.",
      },
      { type: "h3", text: "First 10 minutes" },
      {
        type: "ol",
        items: [
          "Install Earth Wallet (Chrome extension) if needed, then Connect Earth Wallet from the header. Preview trades still run without a wallet.",
          "On Trade, pick a listed pair, read the chart, and buy or sell on the Earth AMM ticket.",
          "On Swap, try SOL → USDC, then MRD → SOL. Meridian is the built-in custom u128 example.",
          "On Launchpad, pick a live standard and launch a coin (name, ticker, logo, description, socials) with virtual SOL liquidity.",
          "On Standards, Create a contract → Mandate (TSxxx5) for an AI-agent token. Other factories are variables-only too. Or upload public contract source and burn $1,000 of $EARTH for a new standard Earth deploys.",
          "On Liquidity, add another pair or add size to an existing pool.",
        ],
      },
      {
        type: "table",
        headers: ["Tab", "Use it to"],
        rows: [
          ["Trade", "Chart, depth, tape, and buy/sell against an Earth pool (including custom u128 pairs)"],
          ["Swap", "Quote Earth CPMM, Earth Stable, two-hop routes, and optional Jupiter; execute Earth routes"],
          ["Pools", "See reserves, indexed USD, fee, and which standards sit on each side"],
          ["Liquidity", "Create a pool or add / withdraw LP"],
          ["Launchpad", "Create a coin on a live standard with virtual SOL; graduate into a locked Earth pool"],
          ["Standards", "Create a contract on a factory, upload public source and burn $1,000 of $EARTH for a new standard"],
        ],
      },
      {
        type: "p",
        text: "Web-app tokens, pools, and LP shares live in this browser (localStorage). Published standards go to the Earth catalog so other users can find them. Clearing site data resets local listings. Earth Wallet stores an encrypted vault in the Chrome profile; the seed never leaves the device.",
      },
    ],
  },
  {
    id: "standards",
    title: "Create and find token standards",
    blurb: "A standard is a program. Upload its source (public), burn $1,000 of $EARTH, Earth deploys it so anyone can create a contract on it.",
    blocks: [
      {
        type: "p",
        text: "A token standard is the program that stores and transfers amounts. You name it, upload the contract source, and burn $1,000 of $EARTH. That source is public on the standard card. Earth deploys the program, publishes it to the catalog, and anyone can create their own contract on it. You never paste a program ID.",
      },
      {
        type: "table",
        headers: ["Field", "Meaning"],
        rows: [
          ["Standard ID", "Assigned as TSxxx1, TSxxx2, TSxxx3, … — factories are TSxxx1–TSxxx5; each new standard gets the next number"],
          ["Name", "Human label, e.g. Meridian"],
          ["Source", "Required. The token contract code. Public on the card and in the catalog"],
          ["Program", "Earth deploys this from your source. You burn $1,000 of $EARTH; you do not paste an address"],
          ["Kind", "custom for standards Earth deploys; spl-token / token-2022 are the native rows"],
          ["Amount width", "u64 (SPL-sized) or u128 (18-decimal supplies that do not fit SPL)"],
          ["Review", "native (built-in), registered (seeded example), or unverified (you or someone else burned $EARTH to create it)"],
        ],
      },
      { type: "h3", text: "Create and publish" },
      {
        type: "ol",
        items: [
          "Open Standards → Create a standard. Give it a name (required).",
          "Amount size: Large (u128) for 18-decimal supplies; Normal (u64) to match SPL. u64 cannot use more than 12 decimals.",
          "Upload or paste the token contract source. It is required and public. Text only — not a ZIP or .so.",
          "You burn $1,000 of $EARTH (quoted from the live $EARTH price). Earth deploys that source and holds upgrade authority. $EARTH is not live yet, so nothing is taken in this protocol preview.",
          "Leave Publish checked so other users can find it. Optionally create your first contract in the same click — you can skip that.",
          "Click Create standard. Copy the share link from the card if the catalog is local-only.",
        ],
      },
      { type: "action", page: "standards", label: "Open Standards" },
      { type: "h3", text: "Find a standard and create a contract on it" },
      {
        type: "ol",
        items: [
          "Browse standards. Search by name or standard ID. Factories, custom, native, and yours are filterable.",
          "Open someone else’s card (or a shared link). Read the public source, then click Create a contract.",
          "Your ticker is listed on their program. Create a pool when you want a market.",
        ],
      },
      { type: "h3", text: "Earth deploys the program" },
      {
        type: "p",
        text: "You upload source text, not a binary. You do not paste a program ID. Creating a standard publishes the code and burns $1,000 of $EARTH so Earth can deploy it. Earth and Earth Wallet then know how to read it.",
      },
      {
        type: "ul",
        items: [
          "Preview: Earth assigns a local program handle (earthprog:…). Name the token, pick decimals, and pool it locally.",
          "Live: the same click burns $1,000 of $EARTH from Earth Wallet. Earth deploys the source you published. You never copy-paste a program address.",
          "Wallet: paste a standard ID (or share code) under Earth Wallet → Standards. The site registry and the wallet registry are separate. Do not paste a program ID in the wallet.",
        ],
      },
      {
        type: "callout",
        kind: "info",
        text: "If Earth has not deployed the program on-chain yet, Earth Wallet keeps custom balances at zero. Earth holds upgrade authority. The contract source is public on the standard card. Remove only drops your local copy (tokens, pools, LP). A published catalog entry stays findable by others.",
      },
      {
        type: "p",
        text: "Built-in: SPL Token and Token-2022 (native, u64), Meridian (u128) as a public catalog example, plus five factories — memecoin, reflect/burn, confidential ZK ElGamal, vested lock, and Mandate (AI-agent native). Create a contract on a factory from Standards → Create a contract; you only fill variables. Fair launches with virtual liquidity are Launchpad.",
      },
    ],
  },
  {
    id: "factories",
    title: "Factory token standards",
    blurb: "Five Earth-built programs. Pick one, fill the variables, create a contract.",
    blocks: [
      {
        type: "p",
        text: "Earth ships five factory programs (Standard IDs TSxxx1–TSxxx5). You do not set a program ID, kind, or amount width. Open Standards → Create a contract, pick a factory, and fill the variables. New custom standards you create get TSxxx6, TSxxx7, and so on — you burn $1,000 of $EARTH, Earth deploys those. Fair launches with virtual liquidity live on Launchpad, not as a factory.",
      },
      {
        type: "table",
        headers: ["Factory", "Standard ID", "You set"],
        rows: [
          ["Memecoin", "TSxxx1", "Supply, buy/sell tax, burn vs creator split, max wallet, anti-snipe, creator wallet"],
          ["Reflect / burn", "TSxxx2", "Supply, reflection bps, burn bps, treasury bps, treasury wallet"],
          ["Confidential (ZK ElGamal)", "TSxxx3", "Optional auditor, auto-approve, pending window. Proofs verify on ZkE1Gama1Proof11111111111111111111111111111"],
          ["Vested lock", "TSxxx4", "Supply, cliff, vest duration, start delay, revocable, beneficiary"],
          ["Mandate", "TSxxx5", "Supply, levy, endowment, epoch cap, epoch hours, per-ACT cap, cooldown, operator, 1–3 allowed destinations, mandate text"],
        ],
      },
      {
        type: "callout",
        kind: "info",
        text: "Mandate is AI-agent native. Create it from Standards → Create a contract → Mandate (TSxxx5). Not Launchpad, not Create a standard. There is no Launch curve factory. On-chain: allowlist, per-ACT cap, epoch cap, cooldown. English mandate text is hashed, not interpreted. Earth does not run the model.",
      },
      {
        type: "callout",
        kind: "warn",
        text: "The native ZK ElGamal proof program is disabled on mainnet pending Solana audits. Confidential preview contracts work locally; do not treat them as production privacy yet.",
      },
      { type: "action", page: "standards", label: "Create a contract on a factory" },
      {
        type: "p",
        text: "Memecoin, reflect, and Mandate levies are applied in Earth quotes: the amount out is what the trader receives after tax.",
      },
    ],
  },
  {
    id: "mandate",
    title: "Create a Mandate (AI-agent) token",
    blurb: "Exact clicks. TSxxx5. Not Launchpad. Not Create a standard.",
    blocks: [
      {
        type: "p",
        text: "Mandate is a factory that already exists (Standard ID TSxxx5). You create a contract on it. You do not upload source. You do not burn $EARTH. You do not use Launchpad for this.",
      },
      {
        type: "ol",
        items: [
          "Open Standards.",
          "Click Create a contract — not Create a standard, not Launchpad.",
          "Click the Mandate card. It is first. It says Mandate and TSxxx5.",
          "Ticker: 2–12 letters or numbers. Token name optional. Decimals default 6 (u64, max 12).",
          "Allowed ACT destination 1 is required: paste a wallet pubkey (not a mint). If Earth Wallet is connected and you leave it blank, Earth fills that wallet.",
          "Operator pubkey: blank = connected Earth Wallet. That key is the only one that can sign act.",
          "Levy, endowment, epoch cap, per-ACT cap, and cooldown are enforced on-chain. English in Mandate (human policy) is hashed only — 8 to 512 characters.",
          "Levy and endowment cannot both be 0. Allowlist addresses must be unique.",
          "Click Create contract. Earth assigns the contract address.",
        ],
      },
      {
        type: "table",
        headers: ["On-chain check", "Default"],
        rows: [
          ["Transfer levy → treasury", "100 bps (1%)"],
          ["Endowment of first mint → treasury", "1000 bps (10%)"],
          ["Epoch spend cap", "500 bps (5%) per 24h"],
          ["Max single ACT", "200 bps (2%) of treasury"],
          ["Cooldown between ACTs", "1 hour"],
          ["Allowlist", "1–3 destination owners"],
        ],
      },
      {
        type: "callout",
        kind: "warn",
        text: "Do not look for Launch curve. That catalog row is gone; TSxxx5 is Mandate. Do not paste model code into Create a standard. Earth Wallet will send the token but will not run the operator or submit act.",
      },
      { type: "action", page: "standards", label: "Open Create a contract" },
    ],
  },
  {
    id: "launchpad",
    title: "Launchpad",
    blurb: "Create a coin on a live standard. Virtual SOL liquidity, then a locked Earth pool.",
    blocks: [
      {
        type: "p",
        text: "Launchpad is how you create a public coin on Earth. It is not a token standard. You pick a standard that is already live — SPL Token, Token-2022, a factory, Meridian, or any published custom adapter — then set name, ticker, logo, description, and socials.",
      },
      {
        type: "ol",
        items: [
          "Open Launchpad → Create a coin.",
          "Paste a Standard ID or pick from the list.",
          "Set ticker, name, logo, description, and optional website / X / Telegram.",
          "Launch. Earth seeds virtual SOL liquidity. Traders buy and sell on the curve.",
          "At 85 SOL raised, remaining tokens plus raised SOL lock into an Earth CPMM pool. That LP cannot be withdrawn.",
        ],
      },
      {
        type: "table",
        headers: ["Curve field", "Value"],
        rows: [
          ["Total supply", "1,000,000,000"],
          ["Sold on the curve", "800,000,000"],
          ["Reserved for the pool", "200,000,000"],
          ["Virtual SOL", "30"],
          ["Graduation", "85 SOL raised"],
          ["Launch fee", "1%"],
        ],
      },
      { type: "action", page: "launchpad", label: "Open Launchpad" },
      {
        type: "callout",
        kind: "info",
        text: "If you pick Memecoin, Reflect/burn, or Mandate, Launchpad applies that factory’s default variables. Change those from Standards if you need a custom tax or levy setup. Curve fills update this browser until the on-chain program is deployed.",
      },
    ],
  },
  {
    id: "tokens",
    title: "Mint and list tokens",
    blurb: "Listing a mint on a standard is how Earth learns a ticker exists.",
    blocks: [
      {
        type: "p",
        text: "You add tokens on Standards. Factory mints: Standards → Mint a token, pick a factory, fill variables only. Custom / SPL: list on a standard card (ticker, name, decimals, optional mint).",
      },
      { type: "h3", text: "Two ways to add a token" },
      {
        type: "ol",
        items: [
          "Mint a token on a factory (Standards → Mint a token) — ticker, name, decimals, and that factory’s variables only.",
          "Mint a token on any standard card in Browse — yours, native, factory, or one you found.",
          "First token while creating a custom standard — optional.",
        ],
      },
      {
        type: "p",
        text: "Leave Mint blank to get a preview mint (earthmint:…). Paste a real mint if it already exists on chain. Duplicate mints are rejected. The same ticker cannot be listed twice on one standard.",
      },
      { type: "h3", text: "What “mint” means here" },
      {
        type: "table",
        headers: ["Situation", "What to do"],
        rows: [
          ["New custom token (like Meridian)", "Create the standard (or pick a public one), leave mint blank, optionally seed a preview pool. You can swap it on Earth in this browser immediately."],
          ["Mint already deployed on your program", "Paste that mint when listing. Register the same mint in Earth Wallet so balances can scan."],
          ["Normal SPL or Token-2022", "Create the mint with the usual Solana tools, then list that address on Earth under spl-token or token-2022. Earth does not replace the official mint instruction."],
          ["Show a zero row in the wallet", "List the mint anyway. The wallet still shows amount 0 until supply exists."],
        ],
      },
      {
        type: "callout",
        kind: "warn",
        text: "Listing on the website does not mint supply into your wallet. Preview mints are local catalog entries, not mainnet accounts. For SPL you receive tokens when someone transfers them or when you mint with the official program.",
      },
      {
        type: "p",
        text: "After a token is listed: Swap if a pool exists (direct or two-hop); Create pool against any other listed token, mixing u64 and u128 if you want; list the same mint in Earth Wallet for send/receive once it is on chain.",
      },
    ],
  },
  {
    id: "liquidity",
    title: "Liquidity pools",
    blurb: "How reserves, curves, fees, and LP shares work — and how to open a pool.",
    blocks: [
      {
        type: "p",
        text: "A pool is two listed tokens, two reserve balances, a curve, a fee, and LP shares. Traders trade against the reserves, not against you personally. You can pool any two listed standards, including a custom u128 token against SOL.",
      },
      { type: "h3", text: "How a deposit works" },
      {
        type: "ol",
        items: [
          "You deposit token A and token B.",
          "The pool records those amounts as reserveA and reserveB.",
          "You receive LP shares — a claim on a fraction of both reserves.",
          "A swap adds the input to one reserve and removes the output from the other, minus the fee. The fee stays in the pool.",
          "Withdraw burns your shares and returns the same fraction of current reserves, not the original deposit amounts.",
        ],
      },
      { type: "h3", text: "Curves" },
      {
        type: "p",
        text: "You pick the curve only when creating a pool. You cannot change it later.",
      },
      {
        type: "ul",
        items: [
          "Constant product (Earth CPMM): Uniswap-v2 style. amountOut = reserveOut × dx / (reserveIn + dx), where dx is input after fee. Use for unlike assets (SOL/USDC, your token/SOL). Default fee 30 bps (0.30%).",
          "Stable (Earth Stable): near 1:1 for like-assets (USDC/USDT). Output stretches as size grows and is capped at 95% of the output reserve. Seed pool uses 4 bps.",
        ],
      },
      { type: "h3", text: "LP shares" },
      {
        type: "ul",
        items: [
          "First deposit: shares = floor(sqrt(amountA × amountB)).",
          "Later deposits: shares = amountA × lpSupply / reserveA. You still must deposit both sides.",
          "If your A/B ratio does not match the pool, you reprice it as you LP. Match the current reserve ratio unless you intend to move the price.",
          "Withdraw in this UI returns your full position: amount = shares × reserve / lpSupply for each side.",
        ],
      },
      { type: "h3", text: "Create a pool from Standards" },
      {
        type: "p",
        text: "Check Also list my first token now and Create a pool now. Quote asset is SOL or USDC. Your token amount and quote amount set the initial price (quote / base). Example: 1,000,000 of your token and 10 SOL implies 0.00001 SOL per token at start. You receive 100% of the initial LP shares.",
      },
      { type: "action", page: "standards", label: "Create a standard and seed a pool" },
      { type: "h3", text: "Create or add from Liquidity" },
      {
        type: "ol",
        items: [
          "Pick Token A and Token B (any listed tokens, any standards). They must differ. One Earth pool per pair.",
          "Enter both amounts (both must be positive).",
          "If the pair is new: pick curve and fee in bps, then Create pool.",
          "If the pair exists: curve and fee are locked. Add liquidity credits more shares.",
          "Withdraw LP returns your full share of both reserves. It is disabled if you have no shares on that pair.",
        ],
      },
      { type: "action", page: "liquidity", label: "Open Liquidity" },
      {
        type: "callout",
        kind: "info",
        text: "Thin pools have high price impact. You are short the asset that pumps (impermanent loss); fees are the compensation. Seeded demo pools: SOL/USDC, USDC/USDT (stable), BONK/SOL, MRD/SOL. Reset seed liquidity restores those four and clears LP positions — including user-created pools in this browser.",
      },
      {
        type: "callout",
        kind: "warn",
        text: "Until the on-chain program is deployed, deposits, swaps, and withdrawals update this browser only. Do not deposit real funds expecting on-chain LP tokens yet.",
      },
    ],
  },
  {
    id: "trade",
    title: "Trading terminal",
    blurb: "Charts, tape, AMM depth, and market orders on listed Earth pairs.",
    blocks: [
      {
        type: "p",
        text: "Trade is the terminal for tokens listed on Earth. Every Earth pool is a market. Pick a pair on the left, read price and liquidity in the center, and send a market order on the right. Custom standards, including u128, trade here the same way SPL does.",
      },
      {
        type: "ul",
        items: [
          "Candles are an Earth AMM series: a seeded history that ends at current pool reserves, then live fills from this browser.",
          "24h change, high, low, and volume come from that series. USD last uses the indexer when it has a print.",
          "Depth is the constant-product or stable curve walked in steps — not a CLOB. Size moves price.",
          "Buy pays the quote token for the base; sell pays the base for the quote. Routes are the same Earth AMM paths as Swap.",
        ],
      },
      { type: "action", page: "trade", label: "Open Trade" },
      {
        type: "callout",
        kind: "info",
        text: "Click a row on Pools, or Trade on a listed mint under Standards, to open that pair in the terminal. Tokens with no pool appear under Listed, no pool — create liquidity first.",
      },
      {
        type: "callout",
        kind: "warn",
        text: "Fills update local pool reserves in this browser until the on-chain Earth program is deployed. Jupiter rows remain quote-only.",
      },
    ],
  },
  {
    id: "swap",
    title: "Swap routes",
    blurb: "Compare Earth CPMM, stable, two-hop, and optional Jupiter, then fill an Earth route.",
    blocks: [
      {
        type: "p",
        text: "Swap is the route board. Use Trade when you want a chart and a buy/sell ticket on one pool. Use Swap when you want every path between two mints, including hops and Jupiter quotes.",
      },
      {
        type: "ol",
        items: [
          "Choose pay token, receive token, and amount. Routes work without a wallet.",
          "Pick a route (best output is selected by default).",
          "Swap on best Earth route. Jupiter rows are quotes only unless a live swap path is configured.",
        ],
      },
      { type: "action", page: "swap", label: "Open Swap" },
      {
        type: "table",
        headers: ["Venue", "When it appears"],
        rows: [
          ["Earth CPMM", "Direct constant-product pool"],
          ["Earth Stable", "Direct stable pool"],
          ["Earth hop", "Two Earth pools sharing a middle mint (e.g. MRD → SOL → USDC)"],
          ["Jupiter", "Both tokens are SPL or Token-2022, and a Jupiter key is configured"],
        ],
      },
      {
        type: "p",
        text: "Custom adapters never go to Jupiter. Two-hop takes a fee on each hop. Pool fee is feeBps / 10,000 of the input. Impact is extra slippage versus spot. Earth routes update local reserves; Jupiter rows are quotes only unless a live swap path is configured.",
      },
    ],
  },
  {
    id: "wallet",
    title: "Earth Wallet",
    blurb: "The wallet we are building so every Earth standard can be held and sent.",
    blocks: [
      {
        type: "p",
        text: "Earth Wallet is a Chrome extension and the only wallet this site connects to. The website is the AMM and registry. The wallet is the key manager and adapter-aware scanner. Other Solana wallets assume SPL (and maybe Token-2022) with u64 amounts. If your program stores a 128-bit amount, they will not show it. Earth Wallet will — once you register the adapter.",
      },
      {
        type: "ul",
        items: [
          "SPL, Token-2022, and registered custom programs are all adapters.",
          "Token-2022 extensions (transfer fee, frozen, non-transferable, metadata) are surfaced; send is disabled when it must be.",
          "Live custom programs: the wallet scans accounts and reads u64 or u128 amounts.",
          "Injects window.earth.solana and Wallet Standard so this site can Connect Earth Wallet.",
          "Keys stay on this device. The vault is encrypted with your password (PBKDF2, 310,000 iterations). Lost seed or password cannot be recovered.",
        ],
      },
      { type: "h3", text: "Create a wallet" },
      {
        type: "ol",
        items: [
          "From the repo: npm run ext:pack. Chrome → Extensions → Load unpacked → earth-wallet/. Pin Earth Wallet and open the popup.",
          "Create a wallet. Write down the 12-word seed. Address path is m/44'/501'/0'/0'. Never paste the words into a website.",
          "Confirm three random words.",
          "Choose a password. It encrypts the vault on this Chrome profile. It is not the seed, and it is not recoverable.",
          "Encrypt and finish. Import seed phrase is the same end state from an existing mnemonic.",
        ],
      },
      { type: "h3", text: "Day to day" },
      {
        type: "ul",
        items: [
          "Unlock to see balances grouped by standard. Lock from the header or footer. Default auto-lock is 15 minutes (0 = never).",
          "Receive: one address for SOL, SPL, Token-2022, and custom adapter accounts you own.",
          "Send: frozen and non-transferable mints cannot be sent. Custom adapters without a live program ID cannot send on chain.",
          "Standards tab: paste a share code from the site, or register a standard and list mints. Seeded factories include Memecoin, Reflect, Confidential, Vest, and Mandate. Stored separately in the extension.",
          "Connecting to this site (or another dapp) opens an approve window. Settings lists connected origins; Forget drops trust. Sign requests each need approval.",
          "Settings: RPC, auto-lock, export seed (password required), refresh balances. Network label follows the RPC URL.",
        ],
      },
      {
        type: "callout",
        kind: "info",
        text: "The wallet does not create pools or run the AMM — do that on this site. It does not mint custom tokens by itself, and it does not run a Mandate operator or submit act. Preview program IDs are not sent to chain. This website only connects Earth Wallet.",
      },
    ],
  },
  {
    id: "adapter",
    title: "Custom adapter layout",
    blurb: "Match this if you deploy a program Earth Wallet should scan and send.",
    blocks: [
      {
        type: "p",
        text: "Each token account owned by your custom program:",
      },
      {
        type: "table",
        headers: ["Offset", "Size", "Field"],
        rows: [
          ["0", "32", "Mint public key"],
          ["32", "32", "Owner public key"],
          ["64", "8 or 16", "Amount (u64 little-endian or u128 little-endian)"],
        ],
      },
      {
        type: "p",
        text: "Minimum data length: 72 bytes (u64) or 80 bytes (u128). The wallet scans getProgramAccounts with memcmp at offset 32 equal to the wallet address.",
      },
      {
        type: "p",
        text: "Transfer instruction: discriminator 1, then amount as 16-byte little-endian u128 (narrow on-chain if accounts are u64). Accounts in order: source (writable), destination (writable), mint (read-only), owner/payer (signer). Earth Wallet does not create a destination account yet — the recipient needs one on that mint first. Mandate keeps extra state on the mint (treasury, operator, mandate hash, epoch cap). The wallet sends transfer 1; the off-chain operator submits act (discriminator 3).",
      },
      {
        type: "p",
        text: "Program ID must be a real base58 Solana address. Preview strings like earthprog:… are not sent to RPC. Declare u64 or u128 when you register; a mismatch shows a wrong balance.",
      },
      {
        type: "p",
        text: "The Earth AMM (next deploy) will store vaults, mints, token programs, amount widths, curve, fee, and LP mint per pool. Swaps CPI into the adapter. Amounts in the instruction are u128, then narrowed if the adapter is u64. Custom vaults will be owned by the Earth program, not by SPL.",
      },
    ],
  },
  {
    id: "limits",
    title: "Limits and safety",
    blurb: "What is live, what is local, and what Earth does not promise.",
    blocks: [
      {
        type: "ul",
        items: [
          "Not an audit. Unverified means allowlisted here, not reviewed.",
          "Not a listing on other wallets. Custom u128 tokens will not appear there until those products add an adapter.",
          "Not Jupiter for custom standards. Jupiter is optional for SPL / Token-2022 when a key is set on Netlify.",
          "Swaps, new pools, and LP in this UI do not move mainnet tokens until the Earth program is deployed.",
          "Do not send real assets into a preview mint. Reset seed liquidity or clearing site data wipes local pools.",
          "Earth Wallet seed and password are unrecoverable if lost.",
        ],
      },
    ],
  },
];
