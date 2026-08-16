import type { CatalogStandard, TokenStandard } from "../types";
import { FACTORY_STANDARDS, findFactory } from "../standards/factories";
import { NATIVE_STANDARDS } from "./registry";

export type CatalogStatus = "live" | "local";

const SHARE_VERSION = 1;

export function catalogFromStandard(standard: TokenStandard, publisher?: string): CatalogStandard {
  return {
    id: standard.id,
    name: standard.name,
    kind: standard.kind,
    programId: standard.programId,
    amountWidth: standard.amountWidth,
    notes: standard.notes,
    publisher: publisher || standard.publisher,
    publishedAt: standard.createdAt ?? Date.now(),
    factory: standard.factory,
  };
}

export function standardFromCatalog(entry: CatalogStandard): TokenStandard {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    programId: entry.programId,
    amountWidth: entry.amountWidth,
    review: "unverified",
    notes: entry.notes,
    source: "catalog",
    published: true,
    publisher: entry.publisher,
    createdAt: entry.publishedAt,
    factory: entry.factory,
  };
}

export const CATALOG_SEED: CatalogStandard[] = [
  {
    id: "meridian-u128",
    name: "Meridian (u128)",
    kind: "custom",
    programId: "MeridianU128Preview11111111111111111111111",
    amountWidth: "u128",
    notes:
      "Built-in example adapter for 128-bit amounts. Anyone can list their own ticker on it in this preview.",
    publisher: "earth",
    publishedAt: 0,
  },
  ...FACTORY_STANDARDS.map((row) => ({ ...catalogFromStandard(row, "earth"), publishedAt: 0 })),
];

export function encodeShareCode(entry: CatalogStandard): string {
  const payload = JSON.stringify({
    v: SHARE_VERSION,
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    programId: entry.programId,
    amountWidth: entry.amountWidth,
    notes: entry.notes,
    publisher: entry.publisher,
    factory: entry.factory,
  });
  const bytes = new TextEncoder().encode(payload);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeShareCode(code: string): CatalogStandard {
  try {
    const padded = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const bin = atob(padded + pad);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CatalogStandard> & { v?: number };
    if (parsed.v !== SHARE_VERSION) throw new Error("That share code is from a newer Earth. Refresh the app.");
    if (!parsed.id || !parsed.name || !parsed.kind || !parsed.programId || !parsed.amountWidth) {
      throw new Error("That share code is incomplete.");
    }
    if (parsed.kind !== "custom" && parsed.kind !== "spl-token" && parsed.kind !== "token-2022") {
      throw new Error("Unknown standard kind in share code.");
    }
    if (parsed.amountWidth !== "u64" && parsed.amountWidth !== "u128") {
      throw new Error("Unknown amount width in share code.");
    }
    return {
      id: String(parsed.id),
      name: String(parsed.name),
      kind: parsed.kind,
      programId: String(parsed.programId),
      amountWidth: parsed.amountWidth,
      notes: String(parsed.notes ?? "Imported from a share code. Unverified — not an audit."),
      publisher: parsed.publisher ? String(parsed.publisher) : undefined,
      publishedAt: Date.now(),
      factory: findFactory(String(parsed.id))?.standard.factory ?? parsed.factory,
    };
  } catch (err) {
    if (err instanceof Error && /share code|Unknown standard|Unknown amount/i.test(err.message)) throw err;
    throw new Error("That is not a valid Earth share code.");
  }
}

export function shareUrl(entry: CatalogStandard): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("page", "standards");
  url.searchParams.set("adopt", encodeShareCode(entry));
  return url.toString();
}

export function mergeStandards(local: TokenStandard[], catalog: CatalogStandard[]): TokenStandard[] {
  const native = new Set(NATIVE_STANDARDS.map((s) => s.id));
  const byId = new Map<string, TokenStandard>();
  const byProgram = new Map<string, string>();
  for (const row of local) {
    byId.set(row.id, row);
    byProgram.set(row.programId, row.id);
  }
  for (const row of catalog) {
    if (native.has(row.id)) continue;
    const existingId = byId.has(row.id) ? row.id : byProgram.get(row.programId);
    if (existingId) {
      const current = byId.get(existingId);
      if (current && !current.published) {
        byId.set(existingId, { ...current, published: true, publisher: current.publisher ?? row.publisher });
      }
      continue;
    }
    byId.set(row.id, standardFromCatalog(row));
  }
  return [...byId.values()];
}

export async function fetchCatalog(): Promise<{ standards: CatalogStandard[]; status: CatalogStatus }> {
  try {
    const res = await fetch("/api/standards", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("catalog unavailable");
    const data = (await res.json()) as { standards?: CatalogStandard[] };
    const standards = Array.isArray(data.standards) ? data.standards : [];
    return { standards: withSeed(standards), status: "live" };
  } catch {
    return { standards: CATALOG_SEED, status: "local" };
  }
}

export async function publishToCatalog(entry: CatalogStandard): Promise<CatalogStandard> {
  const res = await fetch("/api/standards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Could not publish to the catalog.");
  }
  const data = (await res.json()) as { standard?: CatalogStandard };
  return data.standard ?? entry;
}

function withSeed(list: CatalogStandard[]): CatalogStandard[] {
  const ids = new Set(list.map((s) => s.id));
  return [...CATALOG_SEED.filter((s) => !ids.has(s.id)), ...list];
}
