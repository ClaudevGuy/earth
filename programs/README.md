# Earth on-chain program (next deploy)

Netlify cannot deploy Solana programs. The UI ships a complete constant-product + stable AMM and adapter registry. The on-chain program should mirror `src/amm/math.ts`:

## Accounts

- `Pool`: vault A, vault B, mint A, mint B, token program A, token program B, amount width A/B (`u64` | `u128`), curve, fee bps, lp mint
- Vaults are owned by the Earth program, not by SPL, when the adapter is custom

## Instructions

1. `InitializePool`
2. `AddLiquidity`
3. `RemoveLiquidity`
4. `Swap`

Each swap CPIs into the adapter declared for that mint (`spl-token`, `token-2022`, or a registered custom transfer). Amounts are `u128` in the instruction, then narrowed if the adapter is `u64`.

Until this program is deployed and its program ID is set in the UI, Earth executes swaps against local pool state so the aggregator, LP, and multi-standard flows can be used end to end.

Custom token programs Earth Wallet can scan today: [docs/adapter-spec.md](../docs/adapter-spec.md). User-facing guide: [docs/README.md](../docs/README.md).
