# Factory token standards

Earth ships **five factory programs**. You do not write a program. You pick a factory, fill the variables, and create a contract. Earth already deployed these programs. Kind and amount width are fixed.

Each Earth-made standard has a **Standard ID** in the form `TSxxxN`. The five factories are `TSxxx1`–`TSxxx5`. Any standard you create next is `TSxxx6`, then `TSxxx7`, and so on. For those, you burn $1,000 of $EARTH and Earth deploys a new program.

Fair launches with virtual SOL liquidity are **Launchpad**, not a factory. See [Launchpad](launchpad.md).

| Factory | Standard ID | Use it for | You set |
| --- | --- | --- | --- |
| **Memecoin** | `TSxxx1` | Taxed meme coins | supply, buy/sell tax, burn vs creator split, max wallet, anti-snipe, creator |
| **Reflect / burn** | `TSxxx2` | Holder rewards | supply, reflection bps, burn bps, treasury bps, treasury wallet |
| **Confidential (ZK ElGamal)** | `TSxxx3` | Private balances | optional auditor, auto-approve, pending window |
| **Vested lock** | `TSxxx4` | Team / investor allocations | supply, cliff, vest duration, start delay, revocable, beneficiary |
| **Mandate** | `TSxxx5` | AI-agent native tokens | supply, levy, endowment, epoch cap, epoch hours, per-ACT cap, cooldown, operator, 1–3 allowed destinations, mandate text |

On-chain sources live in `programs/`. Preview contracts are local until those programs are deployed. See [Adapter spec](adapter-spec.md) for the shared account layout.

## Memecoin

Buy tax is taken from tokens leaving a pool. Sell tax is taken from tokens entering a pool. The tax splits into burn and creator according to the share bps (those two should add to 10,000). Max wallet is a percent of supply. Anti-snipe is extra tightness for the first N blocks after the first trade.

Earth quotes apply the levy so the number you see is what the buyer or seller actually receives.

## Reflect / burn

Every transfer (including pool swaps) takes `reflection + burn + treasury` bps, capped at 25%. Reflection accrues to holders pro-rata on chain. In the preview the levy is deducted from the transfer; the holder index is not simulated.

## Confidential (ZK ElGamal)

Balances are ElGamal ciphertexts. A transfer does not move a public `u64`. The client submits three proofs which this program checks are owned by Solana’s native **ZK ElGamal proof program**:

`ZkE1Gama1Proof11111111111111111111111111111`

| Proof | What it shows |
| --- | --- |
| Ciphertext–ciphertext equality | The spent ciphertext matches the credit |
| Batched range proof U64 | Remaining and transferred amounts fit in 64 bits |
| Pubkey validity | The destination ElGamal key is well-formed |

Optional auditor pubkey can decrypt. Auto-approve lets new accounts receive credits. Pending window is the Token-2022-style apply-pending delay.

That native proof program is **disabled on mainnet** until Solana finishes audits (June 2025 incident). You can still create a preview contract here. Do not treat encrypted preview balances as production privacy.

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

## What you do not enter

Program ID, kind (`custom`), and amount width. Those belong to the factory. Ticker, name, decimals, and the table above are the contract variables. Earth assigns the contract address.
