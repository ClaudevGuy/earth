const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;

export function parseAmount(raw: string, decimals: number): bigint {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === ".") return 0n;
  const [whole = "0", frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const digits = `${whole.replace(/^0+(?=\d)/, "") || "0"}${fracPadded}`;
  return BigInt(digits);
}

export function formatAmount(value: bigint, decimals: number, maxFrac = 6): string {
  if (decimals === 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const clipped = fracStr.slice(0, maxFrac).replace(/0+$/, "");
  return clipped ? `${whole.toString()}.${clipped}` : whole.toString();
}

export function assertFits(value: bigint, width: "u64" | "u128"): void {
  const max = width === "u64" ? U64_MAX : U128_MAX;
  if (value < 0n || value > max) {
    throw new Error(`Amount ${value} does not fit ${width}`);
  }
}

export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("isqrt of negative");
  if (n < 2n) return n;
  let x0 = n;
  let x1 = (n + 1n) / 2n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x1 + n / x1) / 2n;
  }
  return x0;
}
