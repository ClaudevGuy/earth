import type { ListedToken, TokenStandard } from "./types";
import { SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM, WSOL } from "./constants";

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
    id: "meridian-u128",
    name: "Meridian (u128)",
    kind: "custom",
    programId: "MeridianU128Preview11111111111111111111111",
    amountWidth: "u128",
    review: "registered",
    notes: "Preview adapter for 128-bit amounts. Earth Wallet will scan the program once it is on-chain.",
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
  {
    mint: "MRD1111111111111111111111111111111111111111",
    symbol: "MRD",
    name: "Meridian",
    decimals: 18,
    standardId: "meridian-u128",
    tags: ["custom", "u128"],
  },
];

export function findStandard(id: string, list: TokenStandard[]): TokenStandard | undefined {
  return list.find((s) => s.id === id);
}

export function findToken(mint: string, list: ListedToken[]): ListedToken | undefined {
  return list.find((t) => t.mint === mint);
}

export function isOnChainProgramId(programId: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(programId);
}

export function reviewChecks(standard: TokenStandard): string[] {
  const checks: string[] = [];
  if (standard.kind === "custom" && !isOnChainProgramId(standard.programId)) {
    checks.push("Program ID is not a live Solana address yet. Balances stay at zero until it is deployed.");
  }
  if (standard.amountWidth === "u128") {
    checks.push("u128 amounts are Earth-native. Other wallets will not show this adapter until they add it.");
  }
  if (standard.review === "unverified") {
    checks.push("Unverified: allowlisted in this wallet, not audited.");
  }
  if (standard.kind === "custom") {
    checks.push("Custom programs can be upgraded. Review upgrade authority separately.");
  }
  return checks;
}
