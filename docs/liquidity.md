# Liquidity pools

A pool is two listed tokens, two reserve balances, a curve, a fee, and LP shares. Anyone who deposits both sides gets shares of the pool; traders pay the fee into those reserves.

Earth can pool **any two listed standards**, including a custom `u128` token against SOL. Phantom and Jupiter will not see that pair until they add the same adapter. Earth still can.

## How liquidity works

Traders do not trade with you personally. They trade against the **reserves**.

1. You deposit token A and token B.
2. The pool records those amounts as `reserveA` and `reserveB`.
3. You receive **LP shares** — a claim on a fraction of both reserves.
4. A swap adds the input token to one reserve and removes the output token from the other, minus the fee.
5. The fee stays in the pool, so LP value can rise as volume happens (and can fall if the price moves against the mix you hold — **impermanent loss**).

Withdrawing burns your shares and returns the same fraction of *current* reserves, not the original deposit amounts.

## Curves

You pick the curve only when **creating** a pool. You cannot change it later.

### Constant product (Earth CPMM)

`reserveIn * reserveOut` stays approximately constant (after fees). This is the Uniswap-v2 style curve. Price moves as the mix of reserves changes. Use it for unlike assets (SOL/USDC, MRD/SOL, your token/SOL).

Quote (after fee):

`amountOut = reserveOut * dx / (reserveIn + dx)`

where `dx` is the input after the fee.

Default fee is **30 bps** (0.30%). Fee is `feeBps / 10_000` of the input.

### Stable (Earth Stable)

For like-assets (USDC/USDT). The quote stays near 1:1, with a stretch as size grows, and output is capped at 95% of the output reserve so a pool cannot be emptied in one trade.

Default fee in the USDC/USDT seed pool is **4 bps**. For a new stable pool you can still type any fee in bps.

## LP shares

**First deposit** (new pool):

`shares = floor(sqrt(amountA * amountB))`

**Later deposits** use the A-side ratio:

`shares = amountA * lpSupply / reserveA`

You still must deposit **both** sides. If your A/B ratio does not match the pool, you are changing the price as you LP (you add whatever amounts you type; Earth does not auto-balance to spot). Match the current reserve ratio unless you intend to reprice the pool.

**Withdraw** (this UI withdraws your full position on that pool):

```
amountA = shares * reserveA / lpSupply
amountB = shares * reserveB / lpSupply
```

Your LP shares are shown on the Liquidity pair-notes panel.

## Create a pool from Standards

When creating a standard, check **Also list my first token now** and **Create a pool now**. You can also mint a token on an existing public standard first, then create the pool from the token card.

| Field | Notes |
| --- | --- |
| **Quote asset** | SOL or USDC |
| **Curve** | Constant product (default) or Stable |
| **Your token amount** | Seed size of the new token |
| **Quote amount** | Seed size of SOL or USDC. This **sets the initial price**: `quote / base` |
| **Fee (bps)** | 30 = 0.30% |

Example: 1,000,000 MRD and 10 SOL implies 0.00001 SOL per MRD at start.

Click **Create standard, token, and pool**. Earth opens **Trade** on that pair. You receive 100% of the initial LP shares.

## Create a pool from Liquidity

Open **Liquidity**.

1. Pick **Token A** and **Token B** (any listed tokens, any standards). They must be different. A pair can only have one Earth pool.
2. Enter both amounts (both must be positive).
3. If the pair is new: pick **curve** and **fee (bps)**.
4. Click **Create pool**.

If the pair already exists, the button reads **Add liquidity** and curve/fee are locked.

The header shows **New pool** vs **Existing pool**. Pair notes warn if either side is `u128`.

## Add more liquidity

Same screen, existing pool: enter amounts for both tokens and **Add liquidity**. Shares are credited to your local LP position.

## Withdraw

**Withdraw LP** returns your full share of both reserves and clears the position. Disabled if you have no shares on that pair.

## Price, impact, and USD

- **Spot** in a constant-product pool is `reserveOut / reserveIn` (in raw amounts; decimals differ per token).
- **Price impact** on a swap is how much worse execution is than that spot, in bps.
- **Pools** tab shows reserves and, when the indexer can price a side, approximate USD TVL. Custom preview mints often show “—” until they have an Earth-pool price path to SOL/USDC.

The indexer prices Earth pools from **local reserves**, plus optional Pump.fun mcaps for SPL mints. Status in the header: `indexer live` vs `indexer local`.

## Seeded demo pools

On first load Earth seeds:

- SOL/USDC — constant product, 30 bps
- USDC/USDT — stable, 4 bps
- BONK/SOL — constant product, 30 bps
- MRD/SOL — constant product, 30 bps (Meridian `u128`)

**Reset seed liquidity** on Pools restores those four and **clears LP positions**. User-created pools in `localStorage` are replaced too. Use it only to get back to the demo.

## What LPs should know

- You are short the asset that pumps and long the one that dumps (impermanent loss).
- Thin pools have high price impact. Seed enough quote that a typical swap does not move the market violently.
- Fees are the compensation for that risk. Higher `feeBps` protects LPs and costs traders.
- Until the on-chain program is deployed, deposits, swaps, and withdrawals update **this browser only**. They are a full protocol preview of the math, not a mainnet custody event. Do not deposit real funds expecting on-chain LP tokens yet.
