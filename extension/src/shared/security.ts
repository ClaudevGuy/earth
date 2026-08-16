export function assertHttpsOrigin(origin: string): void {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("Invalid origin.");
  }
  if (url.protocol === "https:") return;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
  throw new Error("Earth Wallet only connects to HTTPS sites, or localhost.");
}

export function assertRpcUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol === "https:") return url.toString().replace(/\/$/, "");
  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return url.toString().replace(/\/$/, "");
  }
  throw new Error("RPC must be HTTPS (or localhost).");
}

export function passwordScore(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  let score: 0 | 1 | 2 | 3 = 0;
  if (password.length >= 8) score = 1;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (password.length >= 8 && variety >= 2) score = 2;
  if (password.length >= 12 && variety >= 3) score = 3;
  return { score, label: ["Too short", "Weak", "Good", "Strong"][score]! };
}

const LOCKOUT_KEY = "earth.wallet.lockout";

type Lockout = { fails: number; until?: number };

export async function assertUnlockedAllowed(): Promise<void> {
  const raw = await chrome.storage.session.get(LOCKOUT_KEY);
  const data = raw[LOCKOUT_KEY] as Lockout | undefined;
  if (data?.until && Date.now() < data.until) {
    const wait = Math.ceil((data.until - Date.now()) / 1000);
    throw new Error(`Too many attempts. Try again in ${wait}s.`);
  }
}

export async function recordUnlockFailure(): Promise<void> {
  const raw = await chrome.storage.session.get(LOCKOUT_KEY);
  const data = (raw[LOCKOUT_KEY] as Lockout | undefined) ?? { fails: 0 };
  const fails = data.fails + 1;
  const until = fails >= 5 ? Date.now() + Math.min(2 ** (fails - 5), 8) * 15_000 : undefined;
  await chrome.storage.session.set({ [LOCKOUT_KEY]: { fails, until } });
}

export async function clearUnlockFailures(): Promise<void> {
  await chrome.storage.session.remove(LOCKOUT_KEY);
}

export function hostLabel(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
