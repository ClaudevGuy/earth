const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const SEED = [
  {
    id: "meridian-u128",
    name: "Meridian (u128)",
    kind: "custom",
    programId: "MeridianU128Preview11111111111111111111111",
    amountWidth: "u128",
    notes:
      "Built-in example adapter for 128-bit amounts. Anyone can create a contract on it.",
    publisher: "earth",
    publishedAt: 0,
  },
  {
    id: "TSxxx1",
    name: "Memecoin",
    kind: "custom",
    programId: "EarthMemeFactory11111111111111111111111111",
    amountWidth: "u64",
    factory: "memecoin",
    notes:
      "Earth-built factory. Create a contract by filling variables — buy/sell tax, burn, creator fee, max wallet, anti-snipe.",
    publisher: "earth",
    publishedAt: 0,
  },
  {
    id: "TSxxx2",
    name: "Reflect / burn",
    kind: "custom",
    programId: "EarthReflectStd11111111111111111111111111",
    amountWidth: "u64",
    factory: "reflect",
    notes:
      "Earth-built factory. Every transfer splits into holder reflection, burn, and treasury.",
    publisher: "earth",
    publishedAt: 0,
  },
  {
    id: "TSxxx3",
    name: "Confidential (ZK ElGamal)",
    kind: "custom",
    programId: "EarthZkElGamal111111111111111111111111111",
    amountWidth: "u64",
    factory: "confidential",
    notes:
      "Earth-built factory. Encrypted balances; transfers verify proofs on the native ZK ElGamal proof program.",
    publisher: "earth",
    publishedAt: 0,
  },
  {
    id: "TSxxx4",
    name: "Vested lock",
    kind: "custom",
    programId: "EarthVestLock1111111111111111111111111111",
    amountWidth: "u128",
    factory: "vesting",
    notes: "Earth-built factory. Cliff plus linear unlock. Unvested amounts cannot transfer.",
    publisher: "earth",
    publishedAt: 0,
  },
  {
    id: "TSxxx5",
    name: "Mandate",
    kind: "custom",
    programId: "EarthAgentMandate11111111111111111111111",
    amountWidth: "u64",
    factory: "agent",
    notes:
      "Earth-built factory. AI-agent native. On-chain allowlist, per-ACT cap, epoch cap, cooldown, treasury. Create a contract from Standards → Create a contract → Mandate (TSxxx5). Not Launchpad.",
    publisher: "earth",
    publishedAt: 0,
  },
];

const MAX = 400;
const KEY = "catalog";

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

const TS_RE = /^TSxxx(\d+)$/;
const ALIAS = {
  "earth-memecoin": "TSxxx1",
  "earth-reflect": "TSxxx2",
  "earth-confidential": "TSxxx3",
  "earth-vesting": "TSxxx4",
  "earth-agent": "TSxxx5",
};

function canonicalId(id) {
  return ALIAS[id] || id;
}

function parseTs(id) {
  const match = TS_RE.exec(canonicalId(id || ""));
  return match ? Number(match[1]) : undefined;
}

function nextTs(list) {
  let max = 5;
  for (const row of list) {
    const n = parseTs(row.id);
    if (n && n > max) max = n;
  }
  return `TSxxx${max + 1}`;
}

function allocateId(requested, programId, list) {
  const all = withSeed(list);
  const byProgram = all.find((s) => s.programId === programId);
  if (byProgram) return byProgram.id;
  const req = canonicalId(requested);
  const n = parseTs(req);
  const taken = new Set(all.map((s) => canonicalId(s.id)));
  const reserved = SEED.find((s) => s.id === req);
  if (reserved && reserved.programId !== programId) return nextTs(all);
  if (n && n > 5 && !taken.has(req)) return req;
  return nextTs(all);
}

function isStaleLaunch(s) {
  const id = canonicalId(s?.id || "");
  if (id === "earth-launch") return true;
  if (s.factory === "launch") return true;
  if (String(s.name || "").trim().toLowerCase() === "launch curve") return true;
  if (String(s.programId || "").includes("LaunchCurve")) return true;
  return false;
}

function withSeed(list) {
  const mandate = SEED.find((s) => s.id === "TSxxx5");
  const migrated = [];
  const seen = new Set();
  for (const s of list) {
    const id = canonicalId(s.id);
    if (isStaleLaunch({ ...s, id })) {
      if (mandate && !seen.has("TSxxx5")) {
        migrated.push({ ...mandate });
        seen.add("TSxxx5");
      }
      continue;
    }
    if (id === "TSxxx5" && mandate) {
      if (!seen.has("TSxxx5")) {
        migrated.push({ ...mandate, publishedAt: s.publishedAt || 0 });
        seen.add("TSxxx5");
      }
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    migrated.push({ ...s, id });
  }
  const ids = new Set(migrated.map((s) => s.id));
  const programs = new Set(migrated.map((s) => s.programId));
  return [...SEED.filter((s) => !ids.has(s.id) && !programs.has(s.programId)), ...migrated];
}

function stripLaunchFromBlob(list) {
  return list.filter((s) => !isStaleLaunch(s) && canonicalId(s.id) !== "TSxxx5");
}

function asString(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function asCode(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").slice(0, max);
}

function validate(raw, list) {
  const name = asString(raw?.name, 64);
  let programId = asString(raw?.programId, 88);
  const notes = asString(raw?.notes, 400);
  const kind = asString(raw?.kind, 24) || "custom";
  const amountWidth = asString(raw?.amountWidth, 8);
  const publisher = asString(raw?.publisher, 64) || undefined;
  const requested = asString(raw?.id, 80);
  const sourceName = asString(raw?.sourceCode?.filename, 80) || "lib.rs";
  const source = asCode(raw?.sourceCode?.code, 100000);
  if (!name) throw new Error("Give the standard a name.");
  if (!source.trim()) throw new Error("Upload the token contract source. It is public.");
  if (source.includes("\0")) throw new Error("Source must be text, not a binary.");
  if (!programId) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "standard";
    programId = `earthprog:${slug}:${Date.now()}`;
  }
  if (kind !== "custom" && kind !== "spl-token" && kind !== "token-2022") {
    throw new Error("Kind must be custom, spl-token, or token-2022.");
  }
  if (amountWidth !== "u64" && amountWidth !== "u128") throw new Error("Amount width must be u64 or u128.");
  const id = allocateId(requested, programId, list);
  return {
    id,
    name,
    kind,
    programId,
    amountWidth,
    notes: notes || "Public source is on this standard. Listing a standard burns $1,000 of $EARTH. Unverified — not an audit.",
    publisher,
    publishedAt: Date.now(),
    factory: raw?.factory,
    sourceCode: { filename: sourceName, code: source },
  };
}

function sameProgram(a, b) {
  return a.programId === b.programId && !a.programId.startsWith("earthprog:");
}

async function getStoreSafe(context) {
  try {
    const mod = await import("@netlify/blobs");
    if (context && typeof mod.connectLambda === "function") {
      try {
        mod.connectLambda(context);
      } catch {
        /* already connected or not a lambda context */
      }
    }
    return mod.getStore("earth-standards");
  } catch {
    return null;
  }
}

function memory() {
  if (!globalThis.__earthCatalog) globalThis.__earthCatalog = [];
  return globalThis.__earthCatalog;
}

async function loadAll(context) {
  const store = await getStoreSafe(context);
  if (store) {
    const data = await store.get(KEY, { type: "json" });
    return Array.isArray(data) ? data : [];
  }
  return memory();
}

async function saveAll(list, context) {
  const store = await getStoreSafe(context);
  if (store) {
    await store.setJSON(KEY, list);
    return;
  }
  globalThis.__earthCatalog = list;
}

export async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  if (event.httpMethod === "GET") {
    const id = event.queryStringParameters?.id;
    const stored = await loadAll(context);
    const cleaned = stripLaunchFromBlob(stored);
    if (cleaned.length !== stored.length) {
      await saveAll(cleaned, context);
    }
    const list = withSeed(cleaned);
    if (id) {
      const want = canonicalId(id);
      const standard = list.find((s) => s.id === want || s.id === id);
      if (!standard) return json(404, { error: "Standard not found." });
      return json(200, { standard });
    }
    return json(200, { standards: list });
  }

  if (event.httpMethod === "POST") {
    const list = await loadAll(context);
    let entry;
    try {
      entry = validate(JSON.parse(event.body || "{}"), list);
    } catch (err) {
      return json(400, { error: err instanceof Error ? err.message : "Invalid standard." });
    }
    const migrated = list.map((s) => ({ ...s, id: canonicalId(s.id) }));
    const idx = migrated.findIndex((s) => s.id === entry.id || sameProgram(s, entry));
    if (idx >= 0) {
      migrated[idx] = { ...migrated[idx], ...entry, id: migrated[idx].id, publishedAt: migrated[idx].publishedAt || entry.publishedAt };
      entry = migrated[idx];
    } else {
      if (migrated.length >= MAX) return json(409, { error: "Catalog is full." });
      migrated.push(entry);
    }
    await saveAll(migrated, context);
    return json(200, { standard: entry });
  }

  return json(405, { error: "method not allowed" });
}
