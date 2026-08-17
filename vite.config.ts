import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_FILE = resolve(dirname(fileURLToPath(import.meta.url)), ".earth-catalog.json");
const MARKET_FILE = resolve(dirname(fileURLToPath(import.meta.url)), ".earth-market.json");
const CATALOG_SEED = [] as Array<{
  id: string;
  name: string;
  kind: string;
  programId: string;
  amountWidth: string;
  notes: string;
  publisher?: string;
  publishedAt: number;
}>;

function json(res: import("http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

function catalogDevPlugin(): Plugin {
  async function load(): Promise<typeof CATALOG_SEED> {
    try {
      const raw = await readFile(CATALOG_FILE, "utf8");
      const parsed = JSON.parse(raw) as typeof CATALOG_SEED;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function save(list: typeof CATALOG_SEED) {
    await writeFile(CATALOG_FILE, JSON.stringify(list, null, 2));
  }

  function withSeed(list: typeof CATALOG_SEED) {
    const ids = new Set(list.map((s) => s.id));
    return [...CATALOG_SEED.filter((s) => !ids.has(s.id)), ...list];
  }

  return {
    name: "earth-catalog-dev",
    configureServer(server) {
      server.middlewares.use("/api/standards", (req, res, next) => {
        void (async () => {
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.end();
            return;
          }
          if (req.method === "GET") {
            const list = withSeed(await load());
            const url = new URL(req.url ?? "/", "http://earth.local");
            const id = url.searchParams.get("id");
            if (id) {
              const standard = list.find((s) => s.id === id);
              if (!standard) {
                json(res, 404, { error: "Standard not found." });
                return;
              }
              json(res, 200, { standard });
              return;
            }
            json(res, 200, { standards: list });
            return;
          }
          if (req.method === "POST") {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            let entry: (typeof CATALOG_SEED)[number] & {
              sourceCode?: { filename: string; code: string };
            };
            try {
              const raw = JSON.parse(Buffer.concat(chunks).toString("utf8")) as typeof entry;
              if (!raw?.id || !raw?.name || !raw?.programId) throw new Error("Invalid standard.");
              const code = typeof raw.sourceCode?.code === "string" ? raw.sourceCode.code.replace(/\r\n/g, "\n") : "";
              if (!code.trim()) throw new Error("Upload the token contract source. It is public.");
              entry = {
                id: String(raw.id),
                name: String(raw.name).slice(0, 64),
                kind: raw.kind,
                programId: String(raw.programId),
                amountWidth: raw.amountWidth,
                notes: String(raw.notes ?? "").slice(0, 400),
                publisher: raw.publisher,
                publishedAt: Date.now(),
                sourceCode: {
                  filename: String(raw.sourceCode?.filename ?? "lib.rs").slice(0, 80),
                  code: code.slice(0, 100_000),
                },
              };
            } catch (err) {
              json(res, 400, { error: err instanceof Error ? err.message : "Invalid standard." });
              return;
            }
            const list = await load();
            const idx = list.findIndex((s) => s.id === entry.id || s.programId === entry.programId);
            if (idx >= 0) list[idx] = { ...list[idx], ...entry, publishedAt: list[idx]?.publishedAt ?? entry.publishedAt };
            else list.push(entry);
            await save(list);
            json(res, 200, { standard: entry });
            return;
          }
          next();
        })().catch(next);
      });
    },
  };
}

function liveDevPlugin(): Plugin {
  const store = {
    async getJSON(key: string) {
      try {
        const all = JSON.parse(await readFile(MARKET_FILE, "utf8")) as Record<string, unknown>;
        return all[key] ?? null;
      } catch {
        return null;
      }
    },
    async setJSON(key: string, value: unknown) {
      let all: Record<string, unknown> = {};
      try {
        all = JSON.parse(await readFile(MARKET_FILE, "utf8")) as Record<string, unknown>;
      } catch {
        all = {};
      }
      all[key] = value;
      await writeFile(MARKET_FILE, JSON.stringify(all, null, 2));
    },
  };

  async function readBody(req: import("http").IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  }

  return {
    name: "earth-live-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const path = (req.url ?? "").split("?")[0];
          if (path === "/api/market" || path === "/api/settle") {
            const { handleMarket, handleSettle } = await import("./netlify/lib/live.mjs");
            const event = {
              httpMethod: req.method,
              body: req.method === "GET" ? undefined : await readBody(req),
              queryStringParameters: Object.fromEntries(new URL(req.url ?? "/", "http://earth.local").searchParams),
            };
            const result =
              path === "/api/market"
                ? await handleMarket(event, store)
                : await handleSettle(event, store, process.env.SOLANA_RPC_URL || process.env.VITE_RPC_URL || "https://api.mainnet-beta.solana.com");
            res.statusCode = result.statusCode;
            for (const [key, value] of Object.entries(result.headers ?? {})) res.setHeader(key, String(value));
            res.end(result.body ?? "");
            return;
          }
          next();
        })().catch(next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), catalogDevPlugin(), liveDevPlugin()],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["buffer", "@solana/web3.js", "@solana/spl-token"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
