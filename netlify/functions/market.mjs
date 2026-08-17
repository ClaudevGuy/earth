import { getStore } from "@netlify/blobs";
import { emptyState, handleMarket, json } from "../lib/live.mjs";

async function storage(context) {
  try {
    if (context && typeof getStore === "function") {
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
    }
  } catch {
    /* fall through */
  }
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

export async function handler(event, context) {
  return handleMarket(event, await storage(context));
}
