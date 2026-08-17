import { Buffer } from "buffer";

const g = globalThis as typeof globalThis & {
  Buffer: typeof Buffer;
  global?: typeof globalThis;
  window?: typeof globalThis;
};

g.Buffer = Buffer;

function alias(name: "global" | "window"): void {
  if (name in globalThis) return;
  try {
    Object.defineProperty(globalThis, name, {
      value: globalThis,
      configurable: true,
    });
  } catch {
    // Window.window is a getter-only property in extension pages.
  }
}

alias("global");
alias("window");
