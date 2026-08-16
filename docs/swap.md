# Swapping and Trade

**Trade** is the terminal: chart, depth, recent fills, and a buy/sell ticket against one Earth pool. **Swap** is the route board: every Earth path plus optional Jupiter, then execute the best Earth route.

Both fill against **local pool reserves** until the on-chain program is live.

## Trade terminal

1. Connect Earth Wallet if you want on-chain balances. Preview fills work without it.
2. Pick a market from the list (search by ticker). Pools you create on Standards or Liquidity show up here, including custom `u128` pairs such as MRD/SOL.
3. Choose a timeframe. Candles are built from the pool’s reserve path in this browser (not a centralized exchange feed).
4. **Buy** pays the quote asset and receives the base. **Sell** is the reverse.
5. Enter size (or 25/50/75/100% of a connected balance). The ticket quotes Earth routes and shows impact.
6. Confirm. The fill updates reserves, the chart, depth, and the tape.

If there is no Earth pool yet, the terminal asks you to create one under Liquidity. Custom standards including `u128` are first-class here — they just need an Earth pool.

**Add liquidity** on a pair jumps to the Liquidity tab with that market focused.

## Swap (route comparison)

1. Choose pay token, receive token, and amount.
2. Pick a route on the right (best output is selected by default).
3. **Swap on best Earth route**.

If there is no pool (and no two-hop), you will see “No pool yet for this pair. Create one under Liquidity.”

## Routes Earth can quote

| Venue | When it appears |
| --- | --- |
| **Earth CPMM** | Direct constant-product pool for the pair |
| **Earth Stable** | Direct stable pool for the pair |
| **Earth hop** | Two Earth pools sharing a middle mint (for example MRD → SOL → USDC) |
| **Jupiter** | Both tokens are non-custom (`spl-token` or `token-2022`), amount > 0, `/api/jupiter-quote` succeeds |

Custom adapters never go to Jupiter. That is why Meridian and any `u128` standard you register still need an Earth pool.

Two-hop quotes take a fee on **each** hop. Direct is usually better if a direct pool exists.

## Fees and impact

- Pool fee is baked into the quote (`feeBps`). 30 bps = 0.30% of input on that hop.
- **Impact** is extra slippage versus spot, in bps. Large size vs thin reserves → high impact.
- Stable pools stay closer to 1:1 until size is large, then they stretch and cap.

## Wallet balances

Connected Earth Wallet: the pay field can show **Bal** for SPL mints the RPC can see. Preview mints and custom adapters without on-chain accounts will not show a chain balance.

## After you trade (preview)

Reserves in this browser update. Your LP shares on that pool (if any) now claim a different mix of tokens. The Trade chart and tape record that fill locally. That is the same economic effect as a live AMM.
