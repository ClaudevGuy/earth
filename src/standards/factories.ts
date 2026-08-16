import type { TokenStandard } from "../types";
import type { FactorySpec, VariableDef } from "./types";

export const FACTORY_PROGRAM = {
  memecoin: "EarthMemeFactory11111111111111111111111111",
  reflect: "EarthReflectStd11111111111111111111111111",
  confidential: "EarthZkElGamal111111111111111111111111111",
  vesting: "EarthVestLock1111111111111111111111111111",
  launch: "EarthLaunchCurve1111111111111111111111111",
} as const;

const commonNotes = "Earth-built factory. Mint by filling variables — program ID, kind, and amount width are fixed.";

function std(
  id: TokenStandard["id"],
  name: string,
  programId: string,
  amountWidth: TokenStandard["amountWidth"],
  factory: TokenStandard["factory"],
  notes: string,
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
  };
}

const memeVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
    help: "Whole tokens at mint. Decimals are applied automatically.",
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
    help: "Receives creator tax. Optional in preview.",
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
    placeholder: "Blank = mint authority",
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
    help: "Clock starts this many days after mint.",
  },
  {
    key: "revocable",
    label: "Revocable by authority",
    kind: "bool",
    default: false,
    help: "If on, the mint authority can claw back unvested tokens.",
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

const launchVars: VariableDef[] = [
  {
    key: "totalSupply",
    label: "Total supply",
    kind: "amount",
    default: "1000000000",
  },
  {
    key: "tokenReserves",
    label: "Tokens on the curve",
    kind: "amount",
    default: "800000000",
    help: "Sold along the bonding curve. Rest is reserved for the graduated Earth pool.",
  },
  {
    key: "virtualSol",
    label: "Virtual SOL",
    kind: "amount",
    default: "30",
    help: "Virtual quote reserve. Sets the starting price with tokens on the curve.",
  },
  {
    key: "graduationSol",
    label: "Graduation SOL",
    kind: "amount",
    default: "85",
    help: "SOL raised on the curve before the mint migrates to an Earth CPMM pool.",
  },
  {
    key: "creatorFeeBps",
    label: "Creator fee (bps)",
    kind: "bps",
    default: 100,
    min: 0,
    max: 1000,
    help: "Taken as the curve / pool swap fee. 100 = 1%.",
  },
];

export const FACTORIES: FactorySpec[] = [
  {
    standard: std(
      "earth-memecoin",
      "Memecoin",
      FACTORY_PROGRAM.memecoin,
      "u64",
      "memecoin",
      `${commonNotes} Buy/sell tax, burn, creator fee, max wallet, anti-snipe.`,
    ),
    blurb: "Taxed meme mint with burn, creator cut, wallet cap, and a short anti-snipe window.",
    defaultDecimals: 6,
    variables: memeVars,
  },
  {
    standard: std(
      "earth-reflect",
      "Reflect / burn",
      FACTORY_PROGRAM.reflect,
      "u64",
      "reflect",
      `${commonNotes} Every transfer splits into holder reflection, burn, and treasury.`,
    ),
    blurb: "Redistribution token: each transfer reflects to holders, burns supply, and funds a treasury.",
    defaultDecimals: 9,
    variables: reflectVars,
  },
  {
    standard: std(
      "earth-confidential",
      "Confidential (ZK ElGamal)",
      FACTORY_PROGRAM.confidential,
      "u64",
      "confidential",
      `${commonNotes} Encrypted balances. Transfers verify range and equality proofs on the native ZK ElGamal proof program (ZkE1Gama1Proof11111111111111111111111111111).`,
    ),
    blurb: "Private balances via ElGamal ciphertexts. Proofs are verified by Solana’s ZK ElGamal program.",
    defaultDecimals: 6,
    variables: confidentialVars,
  },
  {
    standard: std(
      "earth-vesting",
      "Vested lock",
      FACTORY_PROGRAM.vesting,
      "u128",
      "vesting",
      `${commonNotes} Cliff plus linear unlock. Unvested amounts cannot transfer. Optional clawback.`,
    ),
    blurb: "Team and investor allocations with a cliff, linear vest, and optional revocable grants.",
    defaultDecimals: 9,
    variables: vestingVars,
  },
  {
    standard: std(
      "earth-launch",
      "Launch curve",
      FACTORY_PROGRAM.launch,
      "u64",
      "launch",
      `${commonNotes} Bonding-curve fair launch that graduates into an Earth constant-product pool.`,
    ),
    blurb: "Fair launch on a virtual-reserve curve. Hits a SOL target, then becomes an Earth CPMM pool.",
    defaultDecimals: 6,
    variables: launchVars,
    autoPool: true,
  },
];

export const FACTORY_STANDARDS: TokenStandard[] = FACTORIES.map((row) => row.standard);

export const FACTORY_IDS = new Set(FACTORY_STANDARDS.map((s) => s.id));

export function findFactory(id: string): FactorySpec | undefined {
  return FACTORIES.find((row) => row.standard.id === id);
}

export function defaultVariableValues(factory: FactorySpec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variable of factory.variables) {
    if (variable.kind === "bool") out[variable.key] = variable.default ? "true" : "false";
    else out[variable.key] = String(variable.default);
  }
  return out;
}
