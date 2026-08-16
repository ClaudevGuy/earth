export function makeId(prefix: string): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${rand}`;
}

export function previewProgramId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "standard";
  return `earthprog:${slug}:${makeId("p")}`;
}

export function previewMint(symbol: string): string {
  return `earthmint:${symbol.trim().toLowerCase()}:${makeId("m")}`;
}

export function validateTicker(value: string): string | undefined {
  if (!/^[A-Za-z0-9]{2,12}$/.test(value.trim())) {
    return "Ticker must be 2–12 letters or numbers.";
  }
}

export function validateDecimals(value: number, width: "u64" | "u128"): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 38) return "Decimals must be 0–38.";
  if (width === "u64" && value > 12) {
    return "u64 with more than 12 decimals cannot hold a large supply. Use u128, or fewer decimals.";
  }
}
