import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";
import type { Collectible } from "../shared/types";

const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export function isCollectibleMint(decimals: number, amount: string): boolean {
  if (decimals !== 0) return false;
  try {
    return BigInt(amount) > 0n;
  } catch {
    return false;
  }
}

function metadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM,
  );
  return pda;
}

function readBorshString(data: Uint8Array, offset: number): { value: string; next: number } {
  if (offset + 4 > data.length) return { value: "", next: offset };
  const len = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
  const end = Math.min(data.length, offset + 4 + len);
  const value = new TextDecoder().decode(data.subarray(offset + 4, end)).replace(/\0/g, "").trim();
  return { value, next: offset + 4 + len };
}

function parseMetadata(data: Uint8Array): { name: string; symbol: string; uri: string } | undefined {
  if (data.length < 100) return undefined;
  let offset = 1 + 32 + 32;
  const name = readBorshString(data, offset);
  const symbol = readBorshString(data, name.next);
  const uri = readBorshString(data, symbol.next);
  if (!name.value && !uri.value) return undefined;
  return { name: name.value, symbol: symbol.value, uri: uri.value };
}

function rewriteMedia(url: string): string {
  if (url.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${url.slice(7)}`;
  if (url.startsWith("ar://")) return `https://arweave.net/${url.slice(5)}`;
  return url;
}

async function fetchImage(uri: string): Promise<string | undefined> {
  if (!uri) return undefined;
  try {
    const href = rewriteMedia(uri);
    const res = await fetch(href, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) return href;
    const json = (await res.json()) as { image?: string; animation_url?: string };
    const image = json.image || json.animation_url;
    return image ? rewriteMedia(String(image)) : undefined;
  } catch {
    return undefined;
  }
}

type DasAsset = {
  id?: string;
  burnt?: boolean;
  compression?: { compressed?: boolean };
  content?: {
    json_uri?: string;
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
  };
  grouping?: Array<{ group_key?: string; group_value?: string }>;
  token_info?: { balance?: number };
};

async function fetchDas(rpcUrl: string, owner: string): Promise<Collectible[] | undefined> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "earth-collectibles",
        method: "getAssetsByOwner",
        params: { ownerAddress: owner, page: 1, limit: 100 },
      }),
    });
    const json = (await res.json()) as { result?: { items?: DasAsset[] } };
    const items = json.result?.items;
    if (!Array.isArray(items)) return undefined;
    return items
      .filter((item) => item.id && !item.burnt)
      .map((item) => {
        const collection = item.grouping?.find((g) => g.group_key === "collection")?.group_value;
        return {
          mint: item.id!,
          name: item.content?.metadata?.name || item.id!.slice(0, 4),
          symbol: item.content?.metadata?.symbol,
          image: item.content?.links?.image ? rewriteMedia(item.content.links.image) : undefined,
          collection,
          amount: String(item.token_info?.balance ?? 1),
          compressed: Boolean(item.compression?.compressed),
        };
      });
  } catch {
    return undefined;
  }
}

export async function enrichCollectibles(
  rpcUrl: string,
  owner: string,
  fromAccounts: Collectible[],
): Promise<Collectible[]> {
  const das = await fetchDas(rpcUrl, owner);
  const byMint = new Map<string, Collectible>();
  for (const row of das ?? []) byMint.set(row.mint, row);
  for (const row of fromAccounts) {
    if (!byMint.has(row.mint)) byMint.set(row.mint, row);
  }
  const list = [...byMint.values()];
  const needMeta = list.filter((row) => !row.image || row.name.length <= 4).slice(0, 24);
  if (needMeta.length === 0) return list;

  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const pdas = needMeta.map((row) => metadataPda(new PublicKey(row.mint)));
    const infos = await connection.getMultipleAccountsInfo(pdas);
    await Promise.all(
      needMeta.map(async (row, i) => {
        const info = infos[i];
        if (!info?.data) return;
        const parsed = parseMetadata(info.data instanceof Uint8Array ? info.data : new Uint8Array(info.data));
        if (!parsed) return;
        if (parsed.name) row.name = parsed.name;
        if (parsed.symbol) row.symbol = parsed.symbol;
        if (!row.image && parsed.uri) row.image = await fetchImage(parsed.uri);
      }),
    );
  } catch {
    /* metadata is optional */
  }
  return list;
}
