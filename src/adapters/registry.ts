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
    notes: "Default Solana token program. Wallets and AMMs already speak it.",
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

const CUSTOM_SEED: TokenStandard[] = [];

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
    checks.push("Earth has not deployed this factory program yet. New contracts mint as SPL / Token-2022 so they can trade now.");
  }
  if (standard.amountWidth === "u128") {
    checks.push("u128 amounts will not appear in other wallets until those products add an adapter.");
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
      "Confidential transfers CPI into ZkE1Gama1Proof11111111111111111111111111111. That native program is disabled on mainnet until Solana finishes audits. Contracts still mint; encrypted balances are not production privacy yet.",
    );
  }
  if (standard.factory === "agent") {
    checks.push(
      "Mandate is on-chain: treasury, destination allowlist, per-ACT cap, epoch cap, cooldown. English mandate text is hashed, not interpreted. Earth does not run the model. Open Standards → Create a contract → Mandate (TSxxx5). Not Launchpad.",
    );
  }
  if (standard.factory === "kernel") {
    checks.push(
      "Kernel syscalls (hash, recover, identity) are extra instructions. Earth Wallet sends transfer 1 only — it will not submit syscalls for you.",
    );
  }
  if (standard.factory === "proxy") {
    checks.push(
      "Proxy keeps this contract address when the implementation rotates. Freeze is one-way. Earth Wallet will not propose or commit upgrades.",
    );
  }
  if (standard.factory === "flash") {
    checks.push(
      "Flash borrow requires a repay in the same transaction. Earth Wallet will not open a flash loan for you. Transfers fail while a flash is outstanding.",
    );
  }
  if (standard.factory === "chamber") {
    checks.push(
      "Chamber is on-chain governance (propose, vote, queue, execute). Earth Wallet will show and send the token; it will not vote or execute proposals.",
    );
  }
  if (standard.factory && standard.review === "registered") {
    checks.push("Earth factory: fill the variables and create a contract. Earth mints it on-chain to your wallet or launch vault.");
  }
  return checks;
}
