import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { Keypair } from "@solana/web3.js";
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

export type VaultPayload = {
  mnemonic: string;
  account: number;
};

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
    new DataView(data.buffer).setUint32(33, hardened, false);
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
  const mnemonic = normalizeMnemonic(value);
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error("That seed phrase is not a valid BIP-39 mnemonic.");
  }
  return mnemonic;
}

export function keypairFromMnemonic(mnemonic: string, account = 0): Keypair {
  const seed = mnemonicToSeedSync(assertMnemonic(mnemonic), "");
  const secret = slip10(seed, [44, 501, account, 0]);
  return Keypair.fromSeed(secret);
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

export function serializeSecret(keypair: Keypair): string {
  return bytesToBase64(keypair.secretKey);
}

export function keypairFromStored(secretB64: string): Keypair {
  return Keypair.fromSecretKey(base64ToBytes(secretB64));
}
