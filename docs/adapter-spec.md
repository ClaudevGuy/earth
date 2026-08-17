# Custom adapter spec

This is the layout Earth Wallet uses when it **scans and sends** a `custom` standard once Earth has deployed the program. Users upload the source; they do not deploy the binary themselves. They burn $1,000 of $EARTH and Earth deploys. If you are reading the crate sources under `programs/`, match this layout. Those factory sources are also shown on the standard cards.

The on-chain AMM program (not deployed yet) will CPI into the same adapter on each swap. Earth pools already settle through vaults the site coordinates. See `programs/README.md`.

## Account layout

Each token account owned by an Earth-deployed program:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 32 | Contract public key |
| 32 | 32 | Owner public key |
| 64 | 8 or 16 | Amount (`u64` LE or `u128` LE) |

Minimum data length: **72** bytes (`u64`) or **80** bytes (`u128`).

Wallet scan: `getProgramAccounts` with `memcmp` at offset 32 equal to the wallet address.

## Transfer instruction

Discriminator **1**, then amount as **16-byte little-endian `u128`** (narrow on-chain if accounts are `u64`).

Accounts, in order:

0. Source token account (writable)
1. Destination token account (writable)
2. Contract (read-only)
3. Owner / payer (signer)

If the destination has no account yet, Earth Wallet currently **does not create one**. The recipient needs an Earth-compatible account on that contract first.

## Program ID

Earth assigns this. Must be a real base58 Solana address once deployed (32–44 chars in the Solana alphabet). Placeholder handles (`earthprog:…`) are **not** sent to RPC. Users never paste this field.

## Amount width

Declare `u64` or `u128` when Earth creates the standard. The wallet reads 8 or 16 bytes at offset 64 accordingly. A mismatch will show a wrong balance.

## Factory programs

Nine Earth factories keep the same prefix, then extra fields:

| Standard | Amount | Extra after the amount |
| --- | --- | --- |
| Memecoin | u64 | last-tx slot; contract holds tax bps, max wallet, creator |
| Reflect / burn | u64 | contract holds reflection/burn/treasury bps + magnified index |
| Confidential | u64 public amount stays `0` | 64+64 ElGamal ciphertexts, AES decryptable blob, pending counter, ElGamal pubkey, approved flag. Transfer requires proof-context accounts owned by `ZkE1Gama1Proof11111111111111111111111111111`. |
| Vested lock | u128 | granted u128, start timestamp; contract holds cliff/vest/delay/revocable |
| Mandate | u64 | token account is the 72-byte prefix; mint holds levy, endowment, operator, mandate hash, treasury, epoch cap, per-ACT cap, cooldown, last-act timestamp, act counter, 1–3 destination owners |
| Kernel | u64 | token account is the 72-byte prefix; mint holds kernel slot, syscall fee, flags, treasury, last syscall result |
| Proxy | u64 | token account is the 72-byte prefix; mint holds implementation, pending implementation, delay, freeze |
| Flash | u64 | token account is the 72-byte prefix; mint holds vault, outstanding flash, premium, max flash |
| Chamber | u64 | token account adds delegate pubkey + last-voted proposal; mint holds quorum, votes, timelock, treasury |

Sources: `programs/memecoin`, `programs/reflect`, `programs/confidential`, `programs/vesting`, `programs/agent`, `programs/kernel`, `programs/proxy`, `programs/flash`, `programs/chamber`. Launchpad coins use these adapters (or SPL / Token-2022 / a custom standard). The bonding curve is a market, not a token program.

Mandate extra instructions (beyond adapter transfer `1`): `act` (3) spends treasury only to an allowlisted owner, within per-ACT cap, epoch cap, and cooldown; `set_operator` (4); `set_mandate` (5); `pause` (6); `fund` (7); `set_allowlist` (8). Kernel: `hash` (3), `recover` (4), `identity` (5). Proxy: `propose` (3), `commit` (4), `freeze` (5). Flash: `flash_borrow` (3), `flash_repay` (4). Chamber: `propose` (3), `vote` (4), `queue` (5), `execute` (6), `delegate` (7). Earth Wallet sends transfer `1` only. The off-chain operator submits `act`. Create path: [Mandate (AI-agent)](mandate.md).

## Earth AMM (next deploy)

The Earth program will store, per pool:

- vault A/B, contract A/B
- token program A/B (SPL, Token-2022, or an Earth-deployed adapter)
- amount width A/B
- curve, fee bps, LP contract

Vaults for custom adapters are owned by the Earth program, not by SPL.

Instructions: `InitializePool`, `AddLiquidity`, `RemoveLiquidity`, `Swap`. Swap amounts are `u128` in the instruction, then narrowed if the adapter is `u64`.
