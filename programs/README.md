# Earth on-chain programs

Netlify cannot deploy Solana programs. The UI ships AMM math plus five **factory** token programs under `programs/`. Until they are deployed, Earth executes against local preview state.

```bash
cd programs
cargo build-sbf
```

## Earth AMM (next deploy)

Should mirror `src/amm/math.ts`.

### Accounts

- `Pool`: vault A, vault B, mint A, mint B, token program A, token program B, amount width A/B (`u64` | `u128`), curve, fee bps, lp mint
- Vaults are owned by the Earth program, not by SPL, when the adapter is custom

### Instructions

1. `InitializePool`
2. `AddLiquidity`
3. `RemoveLiquidity`
4. `Swap`

Each swap CPIs into the adapter declared for that mint (`spl-token`, `token-2022`, or a factory / registered custom transfer). Amounts are `u128` in the instruction, then narrowed if the adapter is `u64`.

## Factory token programs

Users create contracts on these from **Standards → Create a contract**. Only contract variables are required; Earth already deployed the factory program. Kind and amount width are fixed.

| Crate | Standard ID | Width | What the contract variables configure |
| --- | --- | --- | --- |
| `memecoin` | `TSxxx1` | u64 | buy/sell tax, burn vs creator split, max wallet, anti-snipe |
| `reflect` | `TSxxx2` | u64 | reflection / burn / treasury bps |
| `confidential` | `TSxxx3` | u64 | auditor, auto-approve, pending window — proofs on [ZK ElGamal](https://docs.anza.xyz/runtime/zk-elgamal-proof) (`ZkE1Gama1Proof11111111111111111111111111111`) |
| `vesting` | `TSxxx4` | u128 | cliff, vest duration, start delay, revocable |
| `agent` | `TSxxx5` | u64 | levy, endowment, epoch cap, per-ACT cap, cooldown, operator, 1–3 destination owners, mandate hash |

All five keep the Earth Wallet scan layout: contract @0, owner @32, amount @64 (`u64` or `u128`). Extra config sits after that (Mandate keeps extra on the mint, not the token account). Transfer discriminator **1** plus 16-byte little-endian `u128` amount, same as [Adapter spec](../docs/adapter-spec.md). Mandate `act` (discriminator 3) is the operator spend path and is not sent by a normal wallet transfer.

The confidential factory does not move a public amount. It requires proof-context accounts owned by the native ZK ElGamal proof program. That native program is currently disabled on mainnet pending audits; the factory is written to CPI into it once it is re-enabled.

User-facing guide: [docs/factory-standards.md](../docs/factory-standards.md).
