import { WSOL } from "../lib/constants";
import type { ListedToken } from "../types";
import { loadJson, saveJson } from "../lib/storage";
import { canonicalStandardId } from "../lib/standardId";
import { isOnChainMint } from "../lib/ids";

export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
export const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
export const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

export const BUILTIN: ListedToken[] = [
  { mint: WSOL, symbol: "SOL", name: "Solana", decimals: 9, standardId: "spl-token", tags: ["native"] },
  { mint: USDC, symbol: "USDC", name: "USD Coin", decimals: 6, standardId: "spl-token", tags: ["stable"] },
  { mint: USDT, symbol: "USDT", name: "Tether", decimals: 6, standardId: "spl-token", tags: ["stable"] },
  { mint: BONK, symbol: "BONK", name: "Bonk", decimals: 5, standardId: "spl-token" },
  { mint: JUP, symbol: "JUP", name: "Jupiter", decimals: 6, standardId: "spl-token" },
  { mint: WIF, symbol: "WIF", name: "dogwifhat", decimals: 6, standardId: "spl-token" },
];

const DEMO_MINTS = new Set(["MRD1111111111111111111111111111111111111111"]);

export function loadTokens(): ListedToken[] {
  const extra = loadJson<ListedToken[]>("tokens", []);
  const seen = new Set(BUILTIN.map((t) => t.mint));
  return [
    ...BUILTIN,
    ...extra
      .filter((t) => !seen.has(t.mint) && !DEMO_MINTS.has(t.mint) && (isOnChainMint(t.mint) || t.mint.length > 20))
      .map((t) => ({ ...t, standardId: canonicalStandardId(t.standardId) })),
  ];
}

export function saveExtraTokens(all: ListedToken[]): void {
  const builtin = new Set(BUILTIN.map((t) => t.mint));
  saveJson(
    "tokens",
    all.filter((t) => !builtin.has(t.mint) && !DEMO_MINTS.has(t.mint)),
  );
}

export function mergeMarketTokens(local: ListedToken[], remote: ListedToken[]): ListedToken[] {
  const seen = new Set<string>();
  const out: ListedToken[] = [];
  for (const row of [...BUILTIN, ...remote, ...local]) {
    if (!row?.mint || DEMO_MINTS.has(row.mint) || seen.has(row.mint)) continue;
    if (row.mint.startsWith("earthmint:")) continue;
    seen.add(row.mint);
    out.push({ ...row, standardId: canonicalStandardId(row.standardId) });
  }
  return out;
}

export function findToken(mint: string, list: ListedToken[]): ListedToken | undefined {
  return list.find((t) => t.mint === mint);
}
