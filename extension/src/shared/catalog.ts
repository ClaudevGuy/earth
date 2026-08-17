import type { AmountWidth, StandardKind } from "./types";

export interface CatalogShare {
  id: string;
  name: string;
  kind: StandardKind;
  programId: string;
  amountWidth: AmountWidth;
  notes: string;
  sourceCode?: { filename: string; code: string };
}

export function decodeShareCode(code: string): CatalogShare {
  try {
    const padded = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const bin = atob(padded + pad);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CatalogShare> & { v?: number };
    if (parsed.v !== 1) throw new Error("That share code is from a newer Earth.");
    if (!parsed.id || !parsed.name || !parsed.kind || !parsed.programId || !parsed.amountWidth) {
      throw new Error("That share code is incomplete.");
    }
    return {
      id: String(parsed.id),
      name: String(parsed.name),
      kind: parsed.kind,
      programId: String(parsed.programId),
      amountWidth: parsed.amountWidth,
      notes: String(parsed.notes ?? "Adopted from a share code. Unverified — not an audit."),
      sourceCode:
        parsed.sourceCode && typeof parsed.sourceCode === "object" && typeof parsed.sourceCode.code === "string"
          ? { filename: String(parsed.sourceCode.filename ?? "lib.rs"), code: parsed.sourceCode.code }
          : undefined,
    };
  } catch (err) {
    if (err instanceof Error && /share code|incomplete/i.test(err.message)) throw err;
    throw new Error("That is not a valid Earth share code.");
  }
}
