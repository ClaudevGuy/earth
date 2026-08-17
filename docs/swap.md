# DEX and Trade

**DEX** is the swap: pick two tokens, compare Earth routes, confirm in Earth Wallet. **Trade** is the terminal: chart, depth, recent fills, and a buy/sell ticket. Launchpad coins on the curve show up on Trade as `{TICKER}/SOL`.

Earth is the venue. Aggregation across other DEXes comes later.

## DEX (swap)

1. Connect Earth Wallet. You need it to fill.
2. Choose pay token, receive token, and amount.
3. Pick a route on the right (best output is selected by default).
4. Confirm in Earth Wallet.

If there is no pool (and no two-hop), you will see that there is no Earth route. Create a pool under Liquidity, or launch a coin.

**Open on Trade** jumps to the terminal for that pair.

## Routes Earth can quote

| Venue | When it appears |
| --- | --- |
| **Earth CPMM** | Direct constant-product pool for the pair |
| **Earth Stable** | Direct stable pool for the pair |
| **Earth hop** | Two Earth pools sharing a middle mint (for example your token → SOL → USDC) |

## Trade terminal

1. Connect Earth Wallet.
2. Pick a market from the list. Pools and launchpad coins both show here.
3. Choose a timeframe. Candles record live fills (no seeded history).
4. **Buy** pays the quote asset and receives the base. **Sell** is the reverse.
5. Enter size (or 25/50/75/100% of a connected balance).
6. Confirm in Earth Wallet.

Launchpad rows fill the bonding curve until graduation. Then the pair becomes an Earth pool on the same terminal.

**Add liquidity** on a pair jumps to the Liquidity tab with that market focused.

## After you trade

Earth pool fills move tokens through the pool vault and update the shared book. Launchpad fills move SOL and tokens through the coin’s vault.

Two-hop quotes take a fee on **each** hop. Direct is usually better if a direct pool exists.

## Fees and impact

- Pool fee is baked into the quote (`feeBps`). 30 bps = 0.30% of input on that hop.
- Launch fee is 1% on the curve.
- **Impact** is extra slippage versus spot, in bps. Large size vs thin reserves → high impact.
- Stable pools stay closer to 1:1 until size is large, then they stretch and cap.

## Wallet balances

Connected Earth Wallet: the pay field can show **Bal** for SPL mints the RPC can see. Launchpad holdings show on the curve ticket.
