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
      "Built-in example adapter for 128-bit amounts. Anyone can list their own ticker on it in this preview.",
    publisher: "earth",
    publishedAt: 0,
  },
];

const MAX = 400;
const KEY = "catalog";

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function withSeed(list) {
  const ids = new Set(list.map((s) => s.id));
  return [...SEED.filter((s) => !ids.has(s.id)), ...list];
}

function asString(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function validate(raw) {
  const id = asString(raw?.id, 80);
  const name = asString(raw?.name, 64);
  const programId = asString(raw?.programId, 88);
  const notes = asString(raw?.notes, 400);
  const kind = asString(raw?.kind, 24);
  const amountWidth = asString(raw?.amountWidth, 8);
  const publisher = asString(raw?.publisher, 64) || undefined;
  if (!id || !/^[\w.:-]+$/.test(id)) throw new Error("Invalid standard id.");
  if (!name) throw new Error("Give the standard a name.");
  if (!programId) throw new Error("Program ID is required.");
  if (kind !== "custom" && kind !== "spl-token" && kind !== "token-2022") {
    throw new Error("Kind must be custom, spl-token, or token-2022.");
  }
  if (amountWidth !== "u64" && amountWidth !== "u128") throw new Error("Amount width must be u64 or u128.");
  return {
    id,
    name,
    kind,
    programId,
    amountWidth,
    notes: notes || "Published on Earth. Unverified — not an audit.",
    publisher,
    publishedAt: Date.now(),
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
    const list = withSeed(await loadAll(context));
    if (id) {
      const standard = list.find((s) => s.id === id);
      if (!standard) return json(404, { error: "Standard not found." });
      return json(200, { standard });
    }
    return json(200, { standards: list });
  }

  if (event.httpMethod === "POST") {
    let entry;
    try {
      entry = validate(JSON.parse(event.body || "{}"));
    } catch (err) {
      return json(400, { error: err instanceof Error ? err.message : "Invalid standard." });
    }
    const list = await loadAll(context);
    const idx = list.findIndex((s) => s.id === entry.id || sameProgram(s, entry));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...entry, publishedAt: list[idx].publishedAt || entry.publishedAt };
    } else {
      if (list.length >= MAX) return json(409, { error: "Catalog is full." });
      list.push(entry);
    }
    await saveAll(list, context);
    return json(200, { standard: entry });
  }

  return json(405, { error: "method not allowed" });
}
