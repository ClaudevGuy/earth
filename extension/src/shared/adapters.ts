import type { ListedToken, TokenStandard } from "./types";
import { SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM, WSOL } from "./constants";
import { canonicalStandardId } from "./standardId";

export const NATIVE_STANDARDS: TokenStandard[] = [
  {
    id: "spl-token",
    name: "SPL Token",
    kind: "spl-token",
    programId: SPL_TOKEN_PROGRAM,
    amountWidth: "u64",
    review: "native",
    notes: "Default Solana token program. Accounts are 165 bytes with a u64 amount.",
  },
  {
    id: "token-2022",
    name: "Token-2022",
    kind: "token-2022",
    programId: TOKEN_2022_PROGRAM,
    amountWidth: "u64",
    review: "native",
    notes: "Official successor. Same base layout plus mint/account extensions (transfer fee, metadata, hooks, …).",
  },
];

export const CUSTOM_SEED: TokenStandard[] = [
  {
    id: "TSxxx1",
    name: "Memecoin",
    kind: "custom",
    programId: "earthprog:memecoin",
    amountWidth: "u64",
    review: "registered",
    factory: "memecoin",
    notes: "Earth factory. Buy/sell tax, burn, creator fee, max wallet. Create a contract on the Earth site.",
  },
  {
    id: "TSxxx2",
    name: "Reflect / burn",
    kind: "custom",
    programId: "earthprog:reflect",
    amountWidth: "u64",
    review: "registered",
    factory: "reflect",
    notes: "Earth factory. Reflection, burn, and treasury on every transfer.",
  },
  {
    id: "TSxxx3",
    name: "Confidential (ZK ElGamal)",
    kind: "custom",
    programId: "earthprog:confidential",
    amountWidth: "u64",
    review: "registered",
    factory: "confidential",
    notes: "Earth factory. Encrypted balances; proofs on ZkE1Gama1Proof11111111111111111111111111111.",
  },
  {
    id: "TSxxx4",
    name: "Vested lock",
    kind: "custom",
    programId: "earthprog:vesting",
    amountWidth: "u128",
    review: "registered",
    factory: "vesting",
    notes: "Earth factory. Cliff plus linear unlock. Unvested amounts cannot transfer.",
  },
  {
    id: "TSxxx5",
    name: "Mandate",
    kind: "custom",
    programId: "earthprog:agent",
    amountWidth: "u64",
    review: "registered",
    factory: "agent",
    notes:
      "Earth factory. AI-agent native. On-chain allowlist, per-ACT cap, epoch cap, cooldown. Create the contract on the Earth site: Standards → Create a contract → Mandate (TSxxx5). This wallet does not run the operator.",
  },
  {
    id: "TSxxx6",
    name: "Kernel",
    kind: "custom",
    programId: "earthprog:kernel",
    amountWidth: "u64",
    review: "registered",
    factory: "kernel",
    notes: "Earth factory. Precompile-style syscalls (hash, recover, identity) at a reserved slot. Create a contract on the Earth site.",
  },
  {
    id: "TSxxx7",
    name: "Proxy",
    kind: "custom",
    programId: "earthprog:proxy",
    amountWidth: "u64",
    review: "registered",
    factory: "proxy",
    notes: "Earth factory. Upgradeable shell: same contract address, rotating implementation, optional freeze.",
  },
  {
    id: "TSxxx8",
    name: "Flash",
    kind: "custom",
    programId: "earthprog:flash",
    amountWidth: "u64",
    review: "registered",
    factory: "flash",
    notes: "Earth factory. Atomic uncollateralized credit that must be repaid in the same transaction plus a premium.",
  },
  {
    id: "TSxxx9",
    name: "Chamber",
    kind: "custom",
    programId: "earthprog:chamber",
    amountWidth: "u64",
    review: "registered",
    factory: "chamber",
    notes: "Earth factory. DAO token: propose, vote, queue, execute. Optional treasury levy.",
  },
];

export const BUILTIN_TOKENS: ListedToken[] = [
  { mint: WSOL, symbol: "SOL", name: "Solana", decimals: 9, standardId: "spl-token", tags: ["native"] },
  {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    standardId: "spl-token",
    tags: ["stable"],
  },
  {
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    standardId: "spl-token",
    tags: ["stable"],
  },
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", name: "Bonk", decimals: 5, standardId: "spl-token" },
  { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", symbol: "JUP", name: "Jupiter", decimals: 6, standardId: "spl-token" },
  {
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    symbol: "WIF",
    name: "dogwifhat",
    decimals: 6,
    standardId: "spl-token",
  },
];

export function findStandard(id: string, list: TokenStandard[]): TokenStandard | undefined {
  const canonical = canonicalStandardId(id);
  return list.find((s) => s.id === id || s.id === canonical || canonicalStandardId(s.id) === canonical);
}

export function findToken(mint: string, list: ListedToken[]): ListedToken | undefined {
  return list.find((t) => t.mint === mint);
}

export function isOnChainProgramId(programId: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(programId)) return false;
  if (programId.startsWith("earthprog:")) return false;
  if (programId.includes("Preview")) return false;
  if (/^Earth[A-Z]/.test(programId)) return false;
  if (/Preview|Factory|Std|Lock/.test(programId) && /111111/.test(programId)) return false;
  return true;
}

export function isLiveEarthProgram(programId: string): boolean {
  if (!isOnChainProgramId(programId)) return false;
  if (programId.startsWith("earthprog:")) return false;
  if (programId.includes("Preview")) return false;
  if (/^Earth[A-Z]/.test(programId)) return false;
  return true;
}

export function reviewChecks(standard: TokenStandard): string[] {
  const checks: string[] = [];
  if (standard.kind === "custom" && !isLiveEarthProgram(standard.programId)) {
    checks.push("Earth has not deployed this program on-chain yet. Balances stay at zero until then.");
  }
  if (standard.amountWidth === "u128") {
    checks.push("u128 amounts are Earth-native. Other wallets will not show this adapter until they add it.");
  }
  if (standard.review === "unverified") {
    checks.push("Unverified: allowlisted in this wallet, not audited.");
  }
  if (standard.kind === "custom") {
    checks.push("Earth deploys this program and holds upgrade authority. Listing a standard burns $1,000 of $EARTH on the Earth site.");
  }
  if (standard.factory === "confidential") {
    checks.push("Confidential proofs verify on the ZK ElGamal program, currently disabled on mainnet pending audits.");
  }
  if (standard.factory === "agent") {
    checks.push(
      "Mandate is on-chain: allowlist, per-ACT cap, epoch cap, cooldown. This wallet will not run the operator or submit act. Create the contract on the Earth site: Standards → Create a contract → Mandate (TSxxx5).",
    );
  }
  if (standard.factory === "kernel") {
    checks.push("Kernel syscalls are extra instructions. This wallet sends transfers only.");
  }
  if (standard.factory === "proxy") {
    checks.push("Proxy upgrades stay on-chain. This wallet will not propose or commit an implementation change.");
  }
  if (standard.factory === "flash") {
    checks.push("Flash borrow/repay is not sent by this wallet. Transfers fail while a flash is outstanding.");
  }
  if (standard.factory === "chamber") {
    checks.push("Chamber votes and executes are not sent by this wallet. It will show and send the token only.");
  }
  return checks;
}
