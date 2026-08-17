import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { base58 } from "@scure/base";
import nacl from "tweetnacl";
import { VAULT_ITERATIONS } from "./constants";
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from "./format";

export type VaultBlob = {
  v: 1;
  kdf: "pbkdf2-sha256";
  iter: number;
  salt: string;
  iv: string;
  data: string;
};

export type VaultAccountRecord = {
  id: string;
  name: string;
  kind: "derived" | "imported";
  index?: number;
  mnemonic?: string;
};

export type VaultPayload = {
  mnemonic: string;
  account: number;
  accounts?: VaultAccountRecord[];
  activeId?: string;
};

export type OpenVault = {
  mnemonic: string;
  accounts: VaultAccountRecord[];
  activeId: string;
};

export type WalletKeypair = {
  publicKey: { toBase58(): string };
  secretKey: Uint8Array;
};

function wrapKeypair(secretKey: Uint8Array, publicKey: Uint8Array): WalletKeypair {
  const pk = Uint8Array.from(publicKey);
  if (pk.length !== 32) throw new Error("Wallet key derivation failed.");
  return {
    secretKey: Uint8Array.from(secretKey),
    publicKey: {
      toBase58: () => base58.encode(pk),
    },
  };
}

export function normalizeVault(payload: VaultPayload): OpenVault {
  const mnemonic = payload.mnemonic;
  const accounts =
    payload.accounts && payload.accounts.length > 0
      ? payload.accounts.map((row) => ({
          ...row,
          name: row.name?.trim() || (row.kind === "imported" ? "Imported" : "Wallet"),
        }))
      : [
          {
            id: "derived-0",
            name: "Wallet 1",
            kind: "derived" as const,
            index: payload.account ?? 0,
          },
        ];
  const activeId = accounts.some((row) => row.id === payload.activeId) ? payload.activeId! : accounts[0]!.id;
  return { mnemonic, accounts, activeId };
}

export function toVaultPayload(open: OpenVault): VaultPayload {
  const active = open.accounts.find((row) => row.id === open.activeId) ?? open.accounts[0]!;
  return {
    mnemonic: open.mnemonic,
    account: active.kind === "derived" ? (active.index ?? 0) : 0,
    accounts: open.accounts,
    activeId: open.activeId,
  };
}

export function keypairForAccount(primaryMnemonic: string, account: VaultAccountRecord): WalletKeypair {
  if (account.kind === "imported") {
    if (!account.mnemonic) throw new Error("Imported wallet is missing its seed.");
    return keypairFromMnemonic(account.mnemonic, 0);
  }
  return keypairFromMnemonic(primaryMnemonic, account.index ?? 0);
}

export function nextDerivedIndex(accounts: VaultAccountRecord[]): number {
  let max = -1;
  for (const row of accounts) {
    if (row.kind === "derived") max = Math.max(max, row.index ?? 0);
  }
  return max + 1;
}

const ED25519_SEED = new TextEncoder().encode("ed25519 seed");

function slip10(seed: Uint8Array, path: number[]): Uint8Array {
  let I = hmac(sha512, ED25519_SEED, seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const index of path) {
    const data = new Uint8Array(37);
    data[0] = 0;
    data.set(key, 1);
    const hardened = (index | 0x80000000) >>> 0;
    new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(33, hardened, false);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

export function createMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

export function normalizeMnemonic(value: string): string {
  return value.trim().toLowerCase().split(/\s+/).join(" ");
}

export function assertMnemonic(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error("Enter your 12 or 24 word secret phrase.");
  if (!/\s/.test(raw)) {
    try {
      const bytes = base58.decode(raw);
      if (bytes.length === 32) {
        throw new Error("That's a public address. Import needs the 12 or 24 word secret phrase, not the address.");
      }
      if (bytes.length === 64) {
        throw new Error("That's a private key. Paste the 12 or 24 word secret phrase from Phantom or Solflare.");
      }
    } catch (error) {
      if (error instanceof Error && /public address|private key/i.test(error.message)) throw error;
    }
  }
  const mnemonic = normalizeMnemonic(raw);
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error("That seed phrase is not a valid BIP-39 mnemonic. Check for a missing or misspelled word.");
  }
  return mnemonic;
}

export function keypairFromMnemonic(mnemonic: string, account = 0): WalletKeypair {
  const seed = mnemonicToSeedSync(assertMnemonic(mnemonic), "");
  const secret = Uint8Array.from(slip10(seed, [44, 501, account, 0]));
  const pair = nacl.sign.keyPair.fromSeed(secret);
  return wrapKeypair(pair.secretKey, pair.publicKey);
}

function asSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function deriveAesKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", asSource(utf8ToBytes(password)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: asSource(salt), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptVault(password: string, payload: VaultPayload): Promise<VaultBlob> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, VAULT_ITERATIONS);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asSource(iv) }, key, asSource(utf8ToBytes(JSON.stringify(payload))));
  return {
    v: 1,
    kdf: "pbkdf2-sha256",
    iter: VAULT_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipher)),
  };
}

export async function decryptVault(password: string, blob: VaultBlob): Promise<VaultPayload> {
  const key = await deriveAesKey(password, base64ToBytes(blob.salt), blob.iter);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asSource(base64ToBytes(blob.iv)) },
      key,
      asSource(base64ToBytes(blob.data)),
    );
    const payload = JSON.parse(bytesToUtf8(new Uint8Array(plain))) as VaultPayload;
    if (!payload?.mnemonic) throw new Error("empty");
    return payload;
  } catch {
    throw new Error("Wrong password.");
  }
}

export function serializeSecret(keypair: WalletKeypair): string {
  return bytesToBase64(keypair.secretKey);
}

export function keypairFromStored(secretB64: string): WalletKeypair {
  const pair = nacl.sign.keyPair.fromSecretKey(base64ToBytes(secretB64));
  return wrapKeypair(pair.secretKey, pair.publicKey);
}
