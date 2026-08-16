import { Buffer } from "buffer";

const g = globalThis as typeof globalThis & {
  Buffer: typeof Buffer;
  global: typeof globalThis;
};

g.Buffer = Buffer;
g.global = globalThis;
