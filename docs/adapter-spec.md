# Custom adapter spec

This is the layout Earth Wallet uses when it **scans and sends** a `custom` standard with a live program ID. If you are deploying your own token program for Earth, match this (or wait until Earth versions the adapter).

The on-chain AMM (not deployed yet) will CPI into the same adapter on each swap. See `programs/README.md`.

## Account layout

Each token account owned by your program:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 32 | Mint public key |
| 32 | 32 | Owner public key |
| 64 | 8 or 16 | Amount (`u64` LE or `u128` LE) |

Minimum data length: **72** bytes (`u64`) or **80** bytes (`u128`).

Wallet scan: `getProgramAccounts` with `memcmp` at offset 32 equal to the wallet address.

## Transfer instruction

Discriminator **1**, then amount as **16-byte little-endian `u128`** (narrow on-chain if your accounts are `u64`).

Accounts, in order:

0. Source token account (writable)
1. Destination token account (writable)
2. Mint (read-only)
3. Owner / payer (signer)

If the destination has no account yet, Earth Wallet currently **does not create one**. The recipient needs an Earth-compatible account on that mint first.

## Program ID

Must be a real base58 Solana address (32–44 chars in the Solana alphabet). Preview strings like `earthprog:…` or `MeridianU128Preview…` are **not** sent to RPC.

## Amount width

Declare `u64` or `u128` when you register the standard. The wallet reads 8 or 16 bytes at offset 64 accordingly. A mismatch will show a wrong balance.

## Earth AMM (next deploy)

The Earth program will store, per pool:

- vault A/B, mint A/B
- token program A/B (SPL, Token-2022, or your program)
- amount width A/B
- curve, fee bps, LP mint

Vaults for custom adapters are owned by the Earth program, not by SPL.

Instructions: `InitializePool`, `AddLiquidity`, `RemoveLiquidity`, `Swap`. Swap amounts are `u128` in the instruction, then narrowed if the adapter is `u64`.
