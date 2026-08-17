/** Earth standard IDs: TSxxx1, TSxxx2, TSxxx3, … */
export const TS_PREFIX = "TSxxx";

const TS_ID = /^TSxxx(\d+)$/;

/** First five numbers are Earth factory programs. TSxxx5 is Mandate. Custom standards start at TSxxx6. */
export const FACTORY_STANDARD_IDS = {
  memecoin: "TSxxx1",
  reflect: "TSxxx2",
  confidential: "TSxxx3",
  vesting: "TSxxx4",
  agent: "TSxxx5",
} as const;

export const FACTORY_ID_ALIASES: Record<string, string> = {
  "earth-memecoin": FACTORY_STANDARD_IDS.memecoin,
  "earth-reflect": FACTORY_STANDARD_IDS.reflect,
  "earth-confidential": FACTORY_STANDARD_IDS.confidential,
  "earth-vesting": FACTORY_STANDARD_IDS.vesting,
  "earth-agent": FACTORY_STANDARD_IDS.agent,
};

export const RESERVED_STANDARD_SEQ = 5;

export function isEarthStandardId(id: string): boolean {
  return TS_ID.test(id.trim());
}

export function formatStandardId(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("Standard sequence must be a positive integer.");
  return `${TS_PREFIX}${n}`;
}

export function parseStandardId(id: string): number | undefined {
  const match = TS_ID.exec(id.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function canonicalStandardId(id: string): string {
  return FACTORY_ID_ALIASES[id] ?? id;
}

/** Launchpad is not a token standard. Old catalogs seeded TSxxx5 as "Launch curve". */
export function isRetiredLaunchStandard(row: {
  id?: string;
  factory?: string;
  name?: string;
  programId?: string;
}): boolean {
  const id = canonicalStandardId(row.id ?? "");
  if (id === "earth-launch") return true;
  if (row.factory === "launch") return true;
  if ((row.name ?? "").trim().toLowerCase() === "launch curve") return true;
  if ((row.programId ?? "").includes("LaunchCurve")) return true;
  return false;
}

export function nextStandardId(existing: Iterable<string>): string {
  let max = RESERVED_STANDARD_SEQ;
  for (const id of existing) {
    const n = parseStandardId(canonicalStandardId(id));
    if (n != null && n > max) max = n;
  }
  return formatStandardId(max + 1);
}
