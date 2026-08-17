import { CUSTOM_SEED, NATIVE_STANDARDS } from "../shared/adapters";
import { decodeShareCode } from "../shared/catalog";
import { canonicalStandardId, isEarthStandardId, isRetiredLaunchStandard } from "../shared/standardId";
import type { AmountWidth, StandardKind, TokenStandard } from "../shared/types";

export type CatalogRow = {
  id: string;
  name: string;
  kind: StandardKind;
  programId: string;
  amountWidth: AmountWidth;
  notes?: string;
  factory?: TokenStandard["factory"];
  sourceCode?: TokenStandard["sourceCode"];
  review?: TokenStandard["review"];
  source?: TokenStandard["source"];
};

const LOCAL: CatalogRow[] = [...NATIVE_STANDARDS, ...CUSTOM_SEED];

function asStandard(row: CatalogRow): TokenStandard {
  return {
    id: canonicalStandardId(row.id),
    name: row.name,
    kind: row.kind,
    programId: row.programId,
    amountWidth: row.amountWidth,
    review: row.id === "spl-token" || row.id === "token-2022" ? "native" : "unverified",
    source: "catalog",
    published: true,
    factory: row.factory,
    notes: row.notes?.trim() || "Imported from the Earth catalog. Unverified — not an audit.",
    sourceCode: row.sourceCode,
  };
}

function originsFor(catalogUrl: string | undefined, trusted: string[]): string[] {
  const out: string[] = [];
  const push = (value?: string) => {
    if (!value) return;
    try {
      const url = new URL(value);
      const origin = url.origin;
      if (!out.includes(origin)) out.push(origin);
    } catch {
      /* ignore */
    }
  };
  push(catalogUrl);
  push("http://localhost:5173");
  push("http://127.0.0.1:5173");
  for (const origin of trusted) push(origin);
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function lookupRemote(id: string, origins: string[]): Promise<CatalogRow | undefined> {
  for (const origin of origins) {
    try {
      const data = (await getJson(`${origin}/api/standards?id=${encodeURIComponent(id)}`)) as {
        standard?: CatalogRow;
      };
      if (data.standard?.id && data.standard.programId) return data.standard;
    } catch {
      /* try full list */
    }
    try {
      const data = (await getJson(`${origin}/api/standards`)) as { standards?: CatalogRow[] };
      const hit = data.standards?.find((row) => canonicalStandardId(row.id) === id || row.id === id);
      if (hit?.id && hit.programId) return hit;
    } catch {
      /* next origin */
    }
  }
  return undefined;
}

export async function resolveStandardById(
  raw: string,
  opts: { catalogUrl?: string; trustedOrigins?: string[] },
): Promise<TokenStandard> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a token standard ID (for example TSxxx10).");

  if (!isEarthStandardId(trimmed) && !LOCAL.some((row) => row.id === trimmed || canonicalStandardId(row.id) === trimmed)) {
    try {
      const share = decodeShareCode(trimmed);
      return asStandard(share);
    } catch {
      /* not a share code */
    }
  }

  const id = canonicalStandardId(trimmed);
  const local = LOCAL.find((row) => row.id === id || canonicalStandardId(row.id) === id);
  if (local) {
    return {
      ...asStandard(local),
      review: local.review ?? "unverified",
      source: local.source ?? "seeded",
      userCreated: false,
    };
  }

  const remote = await lookupRemote(id, originsFor(opts.catalogUrl, opts.trustedOrigins ?? []));
  if (remote && (isRetiredLaunchStandard(remote) || canonicalStandardId(remote.id) === "TSxxx5")) {
    const mandate = LOCAL.find((row) => row.id === "TSxxx5");
    if (mandate) {
      return {
        ...asStandard(mandate),
        review: "registered",
        source: "seeded",
        userCreated: false,
      };
    }
  }
  if (remote) return asStandard(remote);

  throw new Error(`${id} was not found in the Earth catalog. Open the Earth site once, or set the catalog URL in Settings.`);
}
