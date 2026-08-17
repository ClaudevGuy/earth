import { getStore } from "@netlify/blobs";
import { emptyState, handleSettle, json } from "../lib/live.mjs";

async function storage(context) {
  try {
    const store = getStore("earth-market");
    return {
      async getJSON(key) {
        const data = await store.get(key, { type: "json" });
        return data ?? null;
      },
      async setJSON(key, value) {
        await store.setJSON(key, value);
      },
    };
  } catch {
    if (!globalThis.__earthMarketMem) {
      globalThis.__earthMarketMem = { state: emptyState(), vaults: {}, tickets: {} };
    }
    const mem = globalThis.__earthMarketMem;
    return {
      async getJSON(key) {
        return mem[key] ?? null;
      },
      async setJSON(key, value) {
        mem[key] = value;
      },
    };
  }
}

export async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  return handleSettle(event, await storage(context), rpc);
}
