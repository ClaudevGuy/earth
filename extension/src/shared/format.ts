const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;

export function shortAddress(value: string, size = 4): string {
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

export function splitProtocolFee(amount: bigint, bps: number): { net: bigint; fee: bigint } {
  if (amount <= 0n || bps <= 0) return { net: amount, fee: 0n };
  const fee = (amount * BigInt(bps)) / 10_000n;
  return { net: amount - fee, fee };
}

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
    throw new Error(`Amount does not fit ${width}`);
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
