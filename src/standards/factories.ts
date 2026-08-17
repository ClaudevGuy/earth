import type { StandardSourceCode, TokenStandard } from "../types";
import type { FactorySpec, VariableDef } from "./types";
import { FACTORY_ID_ALIASES, FACTORY_STANDARD_IDS, canonicalStandardId } from "../lib/standardId";
import memecoinRs from "../../programs/memecoin/src/lib.rs?raw";
import reflectRs from "../../programs/reflect/src/lib.rs?raw";
import confidentialRs from "../../programs/confidential/src/lib.rs?raw";
import vestingRs from "../../programs/vesting/src/lib.rs?raw";
import agentRs from "../../programs/agent/src/lib.rs?raw";
import kernelRs from "../../programs/kernel/src/lib.rs?raw";
import proxyRs from "../../programs/proxy/src/lib.rs?raw";
import flashRs from "../../programs/flash/src/lib.rs?raw";
import chamberRs from "../../programs/chamber/src/lib.rs?raw";

export const FACTORY_PROGRAM = {
  memecoin: "EarthMemeFactory11111111111111111111111111",
  reflect: "EarthReflectStd11111111111111111111111111",
  confidential: "EarthZkElGamal111111111111111111111111111",
  vesting: "EarthVestLock1111111111111111111111111111",
  agent: "EarthAgentMandate11111111111111111111111",
  kernel: "EarthKernelPrecomp11111111111111111111111",
  proxy: "EarthProxyUpgrade11111111111111111111111",
  flash: "EarthFlashCredit111111111111111111111111",
  chamber: "EarthChamberGov1111111111111111111111111",
} as const;

const commonNotes =
  "Earth-built factory. Create a contract by filling variables — Earth deploys the program. Kind and amount width are fixed.";

function std(
  id: TokenStandard["id"],
  name: string,
  programId: string,
  amountWidth: TokenStandard["amountWidth"],
  factory: TokenStandard["factory"],
  notes: string,
  sourceCode: StandardSourceCode,
): TokenStandard {
  return {
    id,
    name,
    kind: "custom",
    programId,
    amountWidth,
    review: "registered",
    source: "seeded",
    published: true,
    publisher: "earth",
    factory,
    notes,
    sourceCode,
  };
}

const memeVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
    help: "Whole tokens when the contract is created. Decimals are applied automatically.",
  },
  {
    key: "buyTaxBps",
    label: "Buy tax (bps)",
    kind: "bps",
    default: 300,
    min: 0,
    max: 2500,
    help: "Taken from tokens leaving a pool. 100 bps = 1%. Cap 25%.",
  },
  {
    key: "sellTaxBps",
    label: "Sell tax (bps)",
    kind: "bps",
    default: 500,
    min: 0,
    max: 2500,
    help: "Taken from tokens entering a pool. Cap 25%.",
  },
  {
    key: "burnShareBps",
    label: "Burn share of tax (bps)",
    kind: "bps",
    default: 4000,
    min: 0,
    max: 10000,
    help: "Portion of the tax that is burned. Remainder can go to the creator.",
  },
  {
    key: "creatorShareBps",
    label: "Creator share of tax (bps)",
    kind: "bps",
    default: 6000,
    min: 0,
    max: 10000,
    help: "Portion of the tax sent to the creator wallet. Burn + creator should be 10,000.",
  },
  {
    key: "maxWalletBps",
    label: "Max wallet (bps of supply)",
    kind: "bps",
    default: 200,
    min: 0,
    max: 10000,
    help: "0 disables the cap. 200 = 2% of supply per wallet.",
  },
  {
    key: "antiSnipeBlocks",
    label: "Anti-snipe blocks",
    kind: "number",
    default: 3,
    min: 0,
    max: 64,
    help: "Blocks after first trade where max wallet is tighter. 0 = off.",
  },
  {
    key: "creator",
    label: "Creator wallet",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Blank = connected Earth Wallet",
    help: "Receives creator tax. Optional.",
  },
];

const reflectVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
  },
  {
    key: "reflectionBps",
    label: "Reflection (bps)",
    kind: "bps",
    default: 200,
    min: 0,
    max: 1500,
    help: "Share of each transfer redistributed to holders pro-rata.",
  },
  {
    key: "burnBps",
    label: "Burn (bps)",
    kind: "bps",
    default: 100,
    min: 0,
    max: 1500,
    help: "Share of each transfer permanently removed.",
  },
  {
    key: "treasuryBps",
    label: "Treasury (bps)",
    kind: "bps",
    default: 100,
    min: 0,
    max: 1500,
    help: "Share of each transfer sent to the treasury wallet.",
  },
  {
    key: "treasury",
    label: "Treasury wallet",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Blank = the creator",
  },
];

const confidentialVars: VariableDef[] = [
  {
    key: "auditor",
    label: "Auditor pubkey",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Optional ElGamal / Solana pubkey",
    help: "If set, the auditor can decrypt amounts. Leave blank for holder-only privacy.",
  },
  {
    key: "autoApprove",
    label: "Auto-approve incoming",
    kind: "bool",
    default: true,
    help: "New accounts can receive confidential credits without a separate approve.",
  },
  {
    key: "pendingWindow",
    label: "Pending credit window",
    kind: "number",
    default: 1,
    min: 1,
    max: 65_535,
    help: "Credits stay pending until ApplyPending (Token-2022 confidential style).",
  },
];

const agentVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
    help: "Whole tokens at create. Endowment is taken from this first mint into the on-chain treasury.",
  },
  {
    key: "levyBps",
    label: "Agent levy (bps)",
    kind: "bps",
    default: 100,
    min: 0,
    max: 2500,
    help: "On-chain: every transfer credits this share to the agent treasury. 100 = 1%. Cap 2500 (25%).",
  },
  {
    key: "endowmentBps",
    label: "Endowment (bps of supply)",
    kind: "bps",
    default: 1000,
    min: 0,
    max: 5000,
    help: "On-chain: share of the first mint that seeds the treasury. 1000 = 10%. Cap 5000 (50%).",
  },
  {
    key: "epochSpendBps",
    label: "Epoch spend cap (bps of treasury)",
    kind: "bps",
    default: 500,
    min: 1,
    max: 10000,
    help: "On-chain: max the operator can ACT in one epoch. 500 = 5% of treasury. Resets every epoch.",
  },
  {
    key: "epochHours",
    label: "Epoch (hours)",
    kind: "number",
    default: 24,
    min: 1,
    max: 168,
    help: "On-chain: hours between epoch resets. 24 = daily. Max 168 (7 days).",
  },
  {
    key: "maxActBps",
    label: "Max single ACT (bps of treasury)",
    kind: "bps",
    default: 200,
    min: 1,
    max: 10000,
    help: "On-chain: one ACT cannot exceed this share of the treasury. 200 = 2%. Applies in addition to the epoch cap.",
  },
  {
    key: "cooldownHours",
    label: "Cooldown between ACTs (hours)",
    kind: "number",
    default: 1,
    min: 0,
    max: 168,
    help: "On-chain: minimum hours between two ACTs. 0 = no cooldown. 1 = one ACT per hour.",
  },
  {
    key: "operator",
    label: "Operator pubkey",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Blank = connected Earth Wallet",
    help: "On-chain: the only key that can sign ACT. This is the off-chain agent. Not the model weights.",
  },
  {
    key: "allowDest1",
    label: "Allowed ACT destination 1",
    kind: "address",
    default: "",
    required: true,
    placeholder: "Solana address (required)",
    help: "On-chain allowlist. ACT may credit a token account owned by this address only. Paste a wallet pubkey, not a mint.",
  },
  {
    key: "allowDest2",
    label: "Allowed ACT destination 2",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Optional second wallet",
    help: "Optional second owner on the on-chain allowlist.",
  },
  {
    key: "allowDest3",
    label: "Allowed ACT destination 3",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Optional third wallet",
    help: "Optional third owner on the on-chain allowlist. Max three.",
  },
  {
    key: "mandate",
    label: "Mandate (human policy)",
    kind: "text",
    default: "Spend treasury only to allowed destinations. Never exceed the epoch cap or per-ACT cap. Report every ACT.",
    required: true,
    help: "Hashed on-chain (not enforced as English). The allowlist, caps, and cooldown are what the program actually checks.",
  },
];

const vestingVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "100000000",
  },
  {
    key: "cliffDays",
    label: "Cliff (days)",
    kind: "days",
    default: 90,
    min: 0,
    max: 3650,
    help: "Nothing unlocks until the cliff. 0 = linear from day one.",
  },
  {
    key: "vestDays",
    label: "Vest duration (days)",
    kind: "days",
    default: 365,
    min: 1,
    max: 3650,
    help: "Linear unlock after the cliff. Must be ≥ cliff.",
  },
  {
    key: "startDelayDays",
    label: "Start delay (days)",
    kind: "days",
    default: 0,
    min: 0,
    max: 3650,
    help: "Clock starts this many days after the contract is created.",
  },
  {
    key: "revocable",
    label: "Revocable by creator",
    kind: "bool",
    default: false,
    help: "If on, the creator can claw back unvested tokens.",
  },
  {
    key: "beneficiary",
    label: "Initial beneficiary",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Blank = connected wallet",
    help: "Wallet that receives the vested supply.",
  },
];

const kernelVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
    help: "Whole tokens when the contract is created.",
  },
  {
    key: "kernelSlot",
    label: "Kernel slot",
    kind: "number",
    default: 1,
    min: 1,
    max: 16,
    help: "Reserved index, like an Ethereum precompile address (0x01–0x10). Unique per contract on this standard.",
  },
  {
    key: "syscallFee",
    label: "Syscall fee (base units)",
    kind: "number",
    default: 0,
    min: 0,
    max: 1_000_000_000,
    help: "Flat token amount charged per hash / recover / identity syscall and credited to the kernel treasury. 0 = free. Ethereum precompiles charge gas; this is the token equivalent.",
  },
  {
    key: "enableHash",
    label: "Enable hash syscall",
    kind: "bool",
    default: true,
    help: "SHA-256 analog. Stores the hash of the syscall payload on the contract.",
  },
  {
    key: "enableRecover",
    label: "Enable recover syscall",
    kind: "bool",
    default: true,
    help: "ecrecover analog. Records a signer pubkey as the recovered identity.",
  },
  {
    key: "enableIdentity",
    label: "Enable identity syscall",
    kind: "bool",
    default: true,
    help: "Identity precompile analog. Copies up to 32 bytes of payload onto the contract.",
  },
];

const proxyVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
  },
  {
    key: "implementation",
    label: "Implementation",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Blank = this proxy program",
    help: "Logic pubkey this contract points at (EIP-1967 analog). Blank uses the factory itself. Holders keep this contract address when it rotates.",
  },
  {
    key: "upgradeDelayHours",
    label: "Upgrade delay (hours)",
    kind: "number",
    default: 48,
    min: 1,
    max: 8760,
    help: "Time between propose and commit. Anyone can commit after the delay. Cap 8760 (1 year).",
  },
  {
    key: "admin",
    label: "Proxy admin",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Blank = connected Earth Wallet",
    help: "Can propose upgrades and freeze. Freeze is one-way (renounce analog).",
  },
  {
    key: "upgradesFrozen",
    label: "Freeze upgrades at create",
    kind: "bool",
    default: false,
    help: "If on, the implementation cannot change. Same as freezing after create.",
  },
];

const flashVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
    help: "Whole tokens at create. The reserve share seeds the flash vault.",
  },
  {
    key: "flashPremiumBps",
    label: "Flash premium (bps)",
    kind: "bps",
    default: 9,
    min: 0,
    max: 1000,
    help: "Paid on repay, Aave-style. 9 = 0.09%. Cap 10%.",
  },
  {
    key: "maxFlashBps",
    label: "Max flash (bps of vault)",
    kind: "bps",
    default: 10000,
    min: 1,
    max: 10000,
    help: "Largest single borrow as a share of the flash vault. 10000 = 100%.",
  },
  {
    key: "reserveBps",
    label: "Vault reserve (bps of supply)",
    kind: "bps",
    default: 2000,
    min: 0,
    max: 5000,
    help: "Share of the first mint that seeds the flash vault. 2000 = 20%. Cap 50%.",
  },
  {
    key: "flashEnabled",
    label: "Flash loans enabled",
    kind: "bool",
    default: true,
    help: "If off, borrow fails. Transfers still work.",
  },
];

const chamberVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
    help: "Voting power is this supply. 1 token = 1 vote, or the account’s delegate.",
  },
  {
    key: "quorumBps",
    label: "Quorum (bps of supply)",
    kind: "bps",
    default: 1000,
    min: 1,
    max: 10000,
    help: "For-votes needed to queue. 1000 = 10% of supply.",
  },
  {
    key: "proposalThresholdBps",
    label: "Proposal threshold (bps of supply)",
    kind: "bps",
    default: 100,
    min: 0,
    max: 5000,
    help: "Minimum holding to propose. 100 = 1%. 0 = any holder.",
  },
  {
    key: "votingPeriodHours",
    label: "Voting period (hours)",
    kind: "number",
    default: 72,
    min: 1,
    max: 8760,
    help: "How long a proposal stays open. 72 = 3 days.",
  },
  {
    key: "timelockHours",
    label: "Timelock (hours)",
    kind: "number",
    default: 24,
    min: 0,
    max: 8760,
    help: "Delay after a successful vote before execute. 24 = 1 day. 0 = execute as soon as queued.",
  },
  {
    key: "treasuryBps",
    label: "Treasury levy (bps)",
    kind: "bps",
    default: 0,
    min: 0,
    max: 1000,
    help: "Optional cut of every transfer into the DAO treasury. 0 = off. Cap 10%.",
  },
  {
    key: "guardian",
    label: "Guardian",
    kind: "address",
    default: "",
    required: false,
    placeholder: "Blank = connected Earth Wallet",
    help: "Admin / guardian pubkey. Holds mint authority. Does not bypass quorum.",
  },
];

export function overlayKnownFactory(standard: TokenStandard): TokenStandard {
  const factory = findFactory(standard.id);
  if (!factory) return standard;
  const seed = factory.standard;
  return {
    ...standard,
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    programId: seed.programId,
    amountWidth: seed.amountWidth,
    review: seed.review,
    factory: seed.factory,
    notes: seed.notes,
    sourceCode: seed.sourceCode ?? standard.sourceCode,
  };
}

export const FACTORIES: FactorySpec[] = [
  {
    standard: std(
      FACTORY_STANDARD_IDS.agent,
      "Mandate",
      FACTORY_PROGRAM.agent,
      "u64",
      "agent",
      `${commonNotes} AI-agent native. On-chain: treasury, levy, endowment, operator, destination allowlist, per-ACT cap, epoch cap, cooldown. The model stays off-chain and can only ACT inside those rules.`,
      { filename: "lib.rs", code: agentRs },
    ),
    blurb: "AI-agent native. On-chain allowlist, per-ACT cap, epoch cap, cooldown. Pick this — not Launchpad, not Create a standard.",
    defaultDecimals: 6,
    variables: agentVars,
  },
  {
    standard: std(
      FACTORY_STANDARD_IDS.memecoin,
      "Memecoin",
      FACTORY_PROGRAM.memecoin,
      "u64",
      "memecoin",
      `${commonNotes} Buy/sell tax, burn, creator fee, max wallet, anti-snipe.`,
      { filename: "lib.rs", code: memecoinRs },
    ),
    blurb: "Taxed meme contract with burn, creator cut, wallet cap, and a short anti-snipe window.",
    defaultDecimals: 6,
    variables: memeVars,
  },
  {
    standard: std(
      FACTORY_STANDARD_IDS.reflect,
      "Reflect / burn",
      FACTORY_PROGRAM.reflect,
      "u64",
      "reflect",
      `${commonNotes} Every transfer splits into holder reflection, burn, and treasury.`,
      { filename: "lib.rs", code: reflectRs },
    ),
    blurb: "Redistribution token: each transfer reflects to holders, burns supply, and funds a treasury.",
    defaultDecimals: 9,
    variables: reflectVars,
  },
  {
    standard: std(
      FACTORY_STANDARD_IDS.confidential,
      "Confidential (ZK ElGamal)",
      FACTORY_PROGRAM.confidential,
      "u64",
      "confidential",
      `${commonNotes} Encrypted balances. Transfers verify range and equality proofs on the native ZK ElGamal proof program (ZkE1Gama1Proof11111111111111111111111111111).`,
      { filename: "lib.rs", code: confidentialRs },
    ),
    blurb: "Private balances via ElGamal ciphertexts. Proofs are verified by Solana’s ZK ElGamal program.",
    defaultDecimals: 6,
    variables: confidentialVars,
  },
  {
    standard: std(
      FACTORY_STANDARD_IDS.vesting,
      "Vested lock",
      FACTORY_PROGRAM.vesting,
      "u128",
      "vesting",
      `${commonNotes} Cliff plus linear unlock. Unvested amounts cannot transfer. Optional clawback.`,
      { filename: "lib.rs", code: vestingRs },
    ),
    blurb: "Team and investor allocations with a cliff, linear vest, and optional revocable grants.",
    defaultDecimals: 9,
    variables: vestingVars,
  },
  {
    standard: std(
      FACTORY_STANDARD_IDS.kernel,
      "Kernel",
      FACTORY_PROGRAM.kernel,
      "u64",
      "kernel",
      `${commonNotes} Precompile-style system contract. Reserved kernel slot plus hash, recover, and identity syscalls. Optional flat syscall fee.`,
      { filename: "lib.rs", code: kernelRs },
    ),
    blurb: "Ethereum precompile analog. Privileged hash, recover, and identity syscalls at a reserved slot — plus a normal token.",
    defaultDecimals: 6,
    variables: kernelVars,
  },
  {
    standard: std(
      FACTORY_STANDARD_IDS.proxy,
      "Proxy",
      FACTORY_PROGRAM.proxy,
      "u64",
      "proxy",
      `${commonNotes} Upgradeable shell. Holders keep this contract address. Admin proposes a new implementation; commit after a delay. Freeze is one-way.`,
      { filename: "lib.rs", code: proxyRs },
    ),
    blurb: "Upgradeable token (EIP-1967 analog). Same address, rotating implementation, optional freeze.",
    defaultDecimals: 6,
    variables: proxyVars,
  },
  {
    standard: std(
      FACTORY_STANDARD_IDS.flash,
      "Flash",
      FACTORY_PROGRAM.flash,
      "u64",
      "flash",
      `${commonNotes} Atomic uncollateralized credit. Borrow from the vault only if repay plus premium is in the same transaction.`,
      { filename: "lib.rs", code: flashRs },
    ),
    blurb: "Flash-loan token. Uncollateralized vault credit that must be repaid in the same transaction, plus a premium.",
    defaultDecimals: 6,
    variables: flashVars,
  },
  {
    standard: std(
      FACTORY_STANDARD_IDS.chamber,
      "Chamber",
      FACTORY_PROGRAM.chamber,
      "u64",
      "chamber",
      `${commonNotes} DAO governance: propose, vote, queue, execute. Quorum, voting period, timelock. Optional transfer levy into the treasury.`,
      { filename: "lib.rs", code: chamberRs },
    ),
    blurb: "DAO token. Holders propose and vote; a timelock sits in front of execute. No middleman.",
    defaultDecimals: 6,
    variables: chamberVars,
  },
];

export const FACTORY_STANDARDS: TokenStandard[] = FACTORIES.map((row) => row.standard);

export const FACTORY_IDS = new Set([
  ...FACTORY_STANDARDS.map((s) => s.id),
  ...Object.keys(FACTORY_ID_ALIASES),
  "earth-launch",
]);

export function findFactory(id: string): FactorySpec | undefined {
  const canonical = canonicalStandardId(id);
  return FACTORIES.find(
    (row) => row.standard.id === canonical || row.standard.id === id || row.standard.factory === id,
  );
}

export function defaultVariableValues(factory: FactorySpec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variable of factory.variables) {
    if (variable.kind === "bool") out[variable.key] = variable.default ? "true" : "false";
    else out[variable.key] = String(variable.default);
  }
  return out;
}
