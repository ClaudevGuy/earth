import type { TokenStandard } from "../types";
import { SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from "../lib/constants";
import { isLiveEarthProgram } from "../lib/ids";
import { loadJson, saveJson } from "../lib/storage";
import { FACTORY_IDS, FACTORY_STANDARDS } from "../standards/factories";
import { canonicalStandardId } from "../lib/standardId";

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
      "Earth-built example adapter for 128-bit amounts (18-decimal supplies that do not fit SPL). Earth deploys the program. Anyone can create a contract on it.",
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
  const canonical = canonicalStandardId(id);
  return list.find((s) => s.id === id || s.id === canonical || canonicalStandardId(s.id) === canonical);
}

export function canRemoveStandard(standard: TokenStandard): boolean {
  return Boolean(standard.userCreated || standard.source === "catalog");
}

export function reviewChecks(standard: TokenStandard): string[] {
  const checks: string[] = [];
  if (standard.kind === "custom" && !isLiveEarthProgram(standard.programId)) {
    checks.push("Earth has not deployed this program on-chain yet. Balances stay at zero until then.");
  }
  if (standard.amountWidth === "u128") {
    checks.push("u128 amounts will not appear in Phantom or Jupiter until those products add an adapter.");
  }
  if (standard.review === "unverified") {
    checks.push("Unverified: not on Earth’s native list. Do not treat this as an audit.");
  }
  if (standard.kind === "custom") {
    checks.push(
      standard.sourceCode?.code
        ? "Source is public on this card. Earth deploys the program and holds upgrade authority."
        : "Earth deploys this program and holds upgrade authority. Listing a standard burns $1,000 of $EARTH.",
    );
  }
  if (standard.factory === "confidential") {
    checks.push(
      "Confidential transfers CPI into ZkE1Gama1Proof11111111111111111111111111111. That native program is disabled on mainnet until Solana finishes audits — you can still create a preview contract here.",
    );
  }
  if (standard.factory === "agent") {
    checks.push(
      "Mandate is on-chain: treasury, destination allowlist, per-ACT cap, epoch cap, cooldown. English mandate text is hashed, not interpreted. Earth does not run the model. Open Standards → Create a contract → Mandate (TSxxx5). Not Launchpad.",
    );
  }
  if (standard.factory && standard.review === "registered") {
    checks.push("Earth factory preview: Earth deploys this program. Fill the variables and create a contract locally.");
  }
  return checks;
}
