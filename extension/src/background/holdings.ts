import { BUILTIN_TOKENS, findStandard, findToken } from "../shared/adapters";
import { SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM, WSOL } from "../shared/constants";
import type { Collectible, ListedToken, TokenBalance, TokenStandard } from "../shared/types";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (!res.ok || json.error) {
    const detail = json.error?.message || `RPC ${res.status}`;
    if (/invalid public key input/i.test(detail)) {
      throw new Error("Could not read this wallet on-chain. Re-import the seed phrase.");
    }
    throw new Error(detail);
  }
  return json.result;
}

function labelForMint(mint: string, listed: ListedToken[]): { symbol: string; name: string; decimals: number } {
  const known = findToken(mint, listed) ?? findToken(mint, BUILTIN_TOKENS);
  if (known) return { symbol: known.symbol, name: known.name, decimals: known.decimals };
  return { symbol: mint.slice(0, 4).toUpperCase(), name: mint, decimals: 0 };
}

export async function fetchHoldings(
  rpcUrl: string,
  owner: string,
  standards: TokenStandard[],
  listed: ListedToken[],
): Promise<{ tokens: TokenBalance[]; collectibles: Collectible[] }> {
  const rows: TokenBalance[] = [];
  const seen = new Set<string>();
  const balance = (await rpc(rpcUrl, "getBalance", [owner])) as { value?: number } | number;
  const sol = typeof balance === "number" ? balance : (balance?.value ?? 0);
  const solMeta = labelForMint(WSOL, listed);
  rows.push({
    mint: WSOL,
    symbol: "SOL",
    name: solMeta.name,
    decimals: 9,
    amount: String(sol),
    standardId: "spl-token",
    programId: SYSTEM_PROGRAM,
    amountWidth: "u64",
    extensions: ["native-sol"],
    nativeSol: true,
  });
  seen.add(`native:${WSOL}`);

  const groups = [
    { programId: SPL_TOKEN_PROGRAM, standardId: "spl-token" as const },
    { programId: TOKEN_2022_PROGRAM, standardId: "token-2022" as const },
  ];

  for (const { programId, standardId } of groups) {
    if (!findStandard(standardId, standards)) continue;
    try {
      const accounts = (await rpc(rpcUrl, "getParsedTokenAccountsByOwner", [
        owner,
        { programId },
      ])) as {
        value?: {
          account: {
            data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number }; state?: string } } };
          };
        }[];
      };
      for (const { account } of accounts.value ?? []) {
        const info = account.data.parsed.info;
        if (seen.has(info.mint) && standardId === "spl-token" && info.mint !== WSOL) continue;
        const meta = labelForMint(info.mint, listed);
        if (info.mint === WSOL) {
          meta.symbol = "wSOL";
          meta.name = "Wrapped SOL";
        }
        rows.push({
          mint: info.mint,
          symbol: meta.symbol,
          name: meta.name,
          decimals: info.tokenAmount.decimals || meta.decimals,
          amount: info.tokenAmount.amount,
          standardId,
          programId,
          amountWidth: "u64",
          extensions: [],
          frozen: info.state === "frozen",
        });
        seen.add(info.mint);
      }
    } catch {
      // keep SOL even if token scan fails
    }
  }

  return { tokens: rows, collectibles: [] };
}
