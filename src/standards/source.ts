import type { StandardSourceCode } from "../types";

export const MAX_SOURCE_CHARS = 100_000;

const SOURCE_NAME = /^[\w.\-]+$/;

export function parseSourceCode(filename: string | undefined, code: string): StandardSourceCode {
  const name = sanitizeSourceFilename(filename);
  const text = code.replace(/\r\n/g, "\n");
  if (!text.trim()) throw new Error("Upload or paste the token contract source. It is public.");
  if (text.length > MAX_SOURCE_CHARS) {
    throw new Error(`Source must be under ${MAX_SOURCE_CHARS.toLocaleString()} characters.`);
  }
  if (text.includes("\0")) throw new Error("That file looks binary. Upload text source (.rs, .toml, .txt).");
  return { filename: name, code: text };
}

export function sanitizeSourceFilename(filename: string | undefined): string {
  const base = (filename?.trim() || "lib.rs").replace(/\\/g, "/").split("/").pop() || "lib.rs";
  const safe = base.slice(0, 80);
  if (!SOURCE_NAME.test(safe)) return "lib.rs";
  return safe;
}

export async function readSourceFile(file: File): Promise<StandardSourceCode> {
  const text = await file.text();
  return parseSourceCode(file.name, text);
}

export function sourceFromUnknown(value: unknown): StandardSourceCode | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as { filename?: unknown; code?: unknown };
  if (typeof row.code !== "string" || !row.code.trim()) return undefined;
  try {
    return parseSourceCode(typeof row.filename === "string" ? row.filename : undefined, row.code);
  } catch {
    return undefined;
  }
}
