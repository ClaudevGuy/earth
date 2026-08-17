import { sha256 } from "@noble/hashes/sha256";
import { Connection, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

const NAME_PROGRAM = new PublicKey("namesL7Q2SEnUTfRMEaAh1X4enVrH1J19JYdsuBWqZ4L");
const REVERSE_CLASS = new PublicKey("33m47vH6Eav6jr5Rywx97WFBheZBuXwuVbEjQkncXgsF");
const HASH_PREFIX = "SPL Name Service";

function hashedName(name: string): Buffer {
  const bytes = new TextEncoder().encode(HASH_PREFIX + name);
  return Buffer.from(sha256(bytes));
}

function reverseKey(owner: PublicKey): PublicKey {
  const hashed = hashedName(owner.toBase58());
  const [key] = PublicKey.findProgramAddressSync(
    [hashed, REVERSE_CLASS.toBuffer(), Buffer.alloc(32)],
    NAME_PROGRAM,
  );
  return key;
}

function asDomain(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const name = value.replace(/\.sol$/i, "").trim();
    return name ? `${name}.sol` : undefined;
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    return asDomain(rec.domain ?? rec.result ?? rec.favoriteDomain ?? rec.name);
  }
  return undefined;
}

async function favoriteFromHttp(owner: string): Promise<string | undefined> {
  const urls = [
    `https://sns-sdk-proxy.bonfida.org/favorite-domain/${owner}`,
    `https://sns-sdk-proxy.bonfida.com/favorite-domain/${owner}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const domain = asDomain(await res.json());
      if (domain) return domain;
    } catch {
      /* next */
    }
  }
  return undefined;
}

function nameFromRegistry(data: Uint8Array): string | undefined {
  if (data.length <= 96) return undefined;
  const rest = data.subarray(96);
  const text = new TextDecoder().decode(rest).replace(/\0/g, "").trim();
  if (!text) return undefined;
  const name = text.replace(/\.sol$/i, "");
  return name ? `${name}.sol` : undefined;
}

export async function lookupSolDomain(rpcUrl: string, owner: string): Promise<string | undefined> {
  const fromHttp = await favoriteFromHttp(owner);
  if (fromHttp) return fromHttp;
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const info = await connection.getAccountInfo(reverseKey(new PublicKey(owner)));
    if (!info?.data) return undefined;
    return nameFromRegistry(info.data instanceof Uint8Array ? info.data : new Uint8Array(info.data));
  } catch {
    return undefined;
  }
}
