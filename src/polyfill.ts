import { Buffer } from "buffer";

const g = globalThis as typeof globalThis & {
  Buffer: typeof Buffer;
  global: typeof globalThis;
  process?: { env: Record<string, string | undefined> };
};

g.Buffer = Buffer;
g.global = globalThis;
g.process = g.process ?? { env: {} };
