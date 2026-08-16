import type { TokenStandard } from "../types";
import { SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from "../lib/constants";
import { loadJson, saveJson } from "../lib/storage";
import { FACTORY_IDS, FACTORY_STANDARDS } from "../standards/factories";

export const NATIVE_STANDARDS: TokenStandard[] = [
  {
    id: "spl-token",
    name: "SPL Token",
    kind: "spl-token",
    programId: SPL_TOKEN_PROGRAM,
    amountWidth: "u64",
    review: "native",
    source: "native",
    notes: "Default Solana token program. Wallets, AMMs, and Jupiter already speak it.",
  },
  {
    id: "token-2022",
    name: "Token-2022",
    kind: "token-2022",
    programId: TOKEN_2022_PROGRAM,
    amountWidth: "u64",
    review: "native",
    source: "native",
    notes: "Official successor. Same u64 amounts, extra extensions. Earth treats it as a first-class adapter.",
  },
];

const CUSTOM_SEED: TokenStandard[] = [
  {
    id: "meridian-u128",
    name: "Meridian (u128)",
    kind: "custom",
    programId: "MeridianU128Preview11111111111111111111111",
    amountWidth: "u128",
    review: "registered",
    source: "seeded",
    published: true,
    publisher: "earth",
    notes:
      "Preview adapter for 128-bit amounts (18-decimal supplies that do not fit SPL). Not deployed on-chain yet. Earth AMM can quote and LP it locally. Anyone can list a ticker on it.",
  },
];

const SEEDED = [...CUSTOM_SEED, ...FACTORY_STANDARDS];
const SEEDED_IDS = new Set(SEEDED.map((s) => s.id));

export function loadStandards(): TokenStandard[] {
  const extra = loadJson<TokenStandard[]>("standards", []);
  const native = new Set(NATIVE_STANDARDS.map((s) => s.id));
  const extras = extra.filter((s) => !native.has(s.id) && !SEEDED_IDS.has(s.id) && !FACTORY_IDS.has(s.id));
  return [...NATIVE_STANDARDS, ...SEEDED, ...extras];
}

export function saveCustomStandards(all: TokenStandard[]): void {
  const native = new Set(NATIVE_STANDARDS.map((s) => s.id));
  saveJson(
    "standards",
    all.filter((s) => !native.has(s.id) && !SEEDED_IDS.has(s.id)),
  );
}

export function findStandard(id: string, list: TokenStandard[]): TokenStandard | undefined {
  return list.find((s) => s.id === id);
}

export function canRemoveStandard(standard: TokenStandard): boolean {
  return Boolean(standard.userCreated || standard.source === "catalog");
}

export function reviewChecks(standard: TokenStandard): string[] {
  const checks: string[] = [];
  if (standard.kind === "custom" && standard.programId.length < 32) {
    checks.push("Program ID looks incomplete.");
  }
  if (standard.amountWidth === "u128") {
    checks.push("u128 amounts will not appear in Phantom or Jupiter until those products add an adapter.");
  }
  if (standard.review === "unverified") {
    checks.push("Unverified: not on Earth’s native list. Do not treat this as an audit.");
  }
  if (standard.kind === "custom") {
    checks.push("Custom programs can be upgraded. Review upgrade authority separately.");
  }
  if (standard.factory === "confidential") {
    checks.push(
      "Confidential transfers CPI into ZkE1Gama1Proof11111111111111111111111111111. That native program is disabled on mainnet until Solana finishes audits — preview minting still works here.",
    );
  }
  if (standard.factory && standard.review === "registered") {
    checks.push("Earth factory preview: program ID is not live on-chain yet. Fill the variables and mint locally.");
  }
  return checks;
}
