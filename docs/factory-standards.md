# Factory token standards

Earth ships **nine factory programs**. You do not write a program. You pick a factory, fill the variables, and create a contract. Earth already deployed these programs. Kind and amount width are fixed.

Each Earth-made standard has a **Standard ID** in the form `TSxxxN`. The nine factories are `TSxxx1`–`TSxxx9`. Any standard you create next is `TSxxx10`, then `TSxxx11`, and so on. For those, you burn $1,000 of $EARTH and Earth deploys a new program.

Fair launches with virtual SOL liquidity are **Launchpad**, not a factory. See [Launchpad](launchpad.md).

| Factory | Standard ID | Use it for | You set |
| --- | --- | --- | --- |
| **Memecoin** | `TSxxx1` | Taxed meme coins | supply, buy/sell tax, burn vs creator split, max wallet, anti-snipe, creator |
| **Reflect / burn** | `TSxxx2` | Holder rewards | supply, reflection bps, burn bps, treasury bps, treasury wallet |
| **Confidential (ZK ElGamal)** | `TSxxx3` | Private balances | optional auditor, auto-approve, pending window |
| **Vested lock** | `TSxxx4` | Team / investor allocations | supply, cliff, vest duration, start delay, revocable, beneficiary |
| **Mandate** | `TSxxx5` | AI-agent native tokens | supply, levy, endowment, epoch cap, epoch hours, per-ACT cap, cooldown, operator, 1–3 allowed destinations, mandate text |
| **Kernel** | `TSxxx6` | Precompile-style system contracts | supply, kernel slot, syscall fee, hash / recover / identity flags |
| **Proxy** | `TSxxx7` | Upgradeable token shells | supply, implementation, upgrade delay, admin, freeze |
| **Flash** | `TSxxx8` | Atomic uncollateralized credit | supply, flash premium, max flash, vault reserve, enabled |
| **Chamber** | `TSxxx9` | DAO governance | supply, quorum, proposal threshold, voting period, timelock, treasury levy, guardian |

On-chain sources live in `programs/`. Factory create mints as SPL / Token-2022 until those factory programs are deployed. See [Adapter spec](adapter-spec.md) for the shared account layout.

## Memecoin

Buy tax is taken from tokens leaving a pool. Sell tax is taken from tokens entering a pool. The tax splits into burn and creator according to the share bps (those two should add to 10,000). Max wallet is a percent of supply. Anti-snipe is extra tightness for the first N blocks after the first trade.

Earth quotes apply the levy so the number you see is what the buyer or seller actually receives.

## Reflect / burn

Every transfer (including pool swaps) takes `reflection + burn + treasury` bps, capped at 25%. Reflection accrues to holders pro-rata on chain. Earth quotes deduct the levy from the transfer.

## Confidential (ZK ElGamal)

Balances are ElGamal ciphertexts. A transfer does not move a public `u64`. The client submits three proofs which this program checks are owned by Solana’s native **ZK ElGamal proof program**:

`ZkE1Gama1Proof11111111111111111111111111111`

| Proof | What it shows |
| --- | --- |
| Ciphertext–ciphertext equality | The spent ciphertext matches the credit |
| Batched range proof U64 | Remaining and transferred amounts fit in 64 bits |
| Pubkey validity | The destination ElGamal key is well-formed |

Optional auditor pubkey can decrypt. Auto-approve lets new accounts receive credits. Pending window is the Token-2022-style apply-pending delay.

That native proof program is **disabled on mainnet** until Solana finishes audits (June 2025 incident). You can still create a Confidential contract. Do not treat encrypted balances as production privacy.

## Vested lock

u128 amounts so large 18-decimal grants fit. Nothing transfers until the cliff. Then the grant unlocks linearly through `vestDays`. If revocable, the creator can claw back whatever is still locked.

## Mandate

An **AI-agent native** token. Create it from **Standards → Create a contract → Mandate (TSxxx5)**. Do not use Launchpad for this. Do not use Create a standard. There is no Launch curve factory.

Step-by-step, every field, and common mistakes: [Mandate (AI-agent)](mandate.md).

The program is the agent’s body. The model stays off-chain. English in the mandate box is hashed; it is **not** what the program enforces.

| Enforced on-chain | Off-chain |
| --- | --- |
| Treasury (levy on every transfer + endowment from the first mint) | The model / agent runtime |
| Operator pubkey (only this key can sign `act`) | Deciding *when* to `act` |
| Destination allowlist (1–3 wallet owners) | Interpreting the written mandate |
| Per-ACT cap, epoch spend cap, cooldown | Hosting the process that holds the operator key |
| Pause `act` (transfers still work) | |

`act` credits a token account only if that account’s **owner** is on the allowlist, the operator signed, both caps pass, and cooldown has elapsed. Earth does not run the model. Earth Wallet will show and send the token; it will not submit `act`.

## Kernel

Ethereum keeps privileged operations at fixed **precompile** addresses (ecrecover, SHA-256, identity, …). Kernel is that idea as a token standard: the contract sits at a reserved **kernel slot** (1–16), transfers are a normal Earth adapter, and extra instructions are syscalls.

| Syscall | Ethereum analog | What it does |
| --- | --- | --- |
| `hash` (3) | SHA-256 precompile | Stores SHA-256 of the payload on the contract |
| `recover` (4) | ecrecover | Records a signer pubkey as the recovered identity |
| `identity` (5) | identity precompile | Copies up to 32 bytes of payload onto the contract |

Each syscall can charge a flat token fee into the kernel treasury (gas analog). Enable at least one syscall. Earth Wallet sends transfer `1` only.

## Proxy

Ethereum **upgradeable proxies** (transparent / UUPS, EIP-1967) keep one address while swapping implementation. Proxy is that idea as a token: holders keep this contract address. The admin proposes a new implementation pubkey; after the delay anyone can commit. Freeze is one-way (renounce analog). Transfers always run through this program so the Earth adapter layout never moves. Earth Wallet will not propose or commit upgrades.

## Flash

Ethereum **flash-loan** providers lend without collateral if the borrow is repaid in the same transaction plus a premium. Flash is that idea as a token. A share of the first mint seeds an on-chain vault. `flash_borrow` (3) credits a draw only if a later `flash_repay` (4) is in the same Solana transaction (Instructions sysvar). Repay returns the draw plus `flashPremiumBps`. Transfers fail while a flash is outstanding. Earth Wallet will not open a flash loan.

## Chamber

Ethereum **Governor + timelock + voting-token** systems let holders propose, vote, queue, and execute without a middleman. Chamber is that idea as a token: 1 token = 1 vote (or the account’s delegate). One active proposal sits on the contract. For-votes must beat against-votes and hit quorum; then a timelock; then execute records the action hash (this factory does not CPI an arbitrary program). Optional `treasuryBps` levies transfers into the DAO treasury — Earth quotes apply that levy. Earth Wallet will show and send the token; it will not vote or execute.

## What you do not enter

Program ID, kind (`custom`), and amount width. Those belong to the factory. Ticker, name, decimals, and the table above are the contract variables. Earth assigns the contract address.
