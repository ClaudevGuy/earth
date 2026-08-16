import { SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM, WSOL } from "./constants";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

export { WSOL };

export function getRpcUrl(): string {
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    return `${window.location.origin}/api/rpc`;
  }
  return import.meta.env.VITE_RPC_URL || DEFAULT_RPC;
}

export function programIdForKind(kind: "spl-token" | "token-2022" | "custom", custom?: string): string {
  if (kind === "spl-token") return SPL_TOKEN_PROGRAM;
  if (kind === "token-2022") return TOKEN_2022_PROGRAM;
  return custom ?? "";
}

export async function fetchBalances(
  owner: string,
): Promise<{ solLamports: bigint; tokens: Map<string, bigint> }> {
  const [{ Connection, PublicKey }, { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID }] = await Promise.all([
    import("@solana/web3.js"),
    import("@solana/spl-token"),
  ]);

  const connection = new Connection(getRpcUrl(), "confirmed");
  const pubkey = new PublicKey(owner);
  const [sol, spl, t22] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const tokens = new Map<string, bigint>();
  tokens.set(WSOL, BigInt(sol));

  for (const group of [spl, t22]) {
    for (const { account } of group.value) {
      const info = account.data.parsed.info as {
        mint: string;
        tokenAmount: { amount: string };
      };
      const current = tokens.get(info.mint) ?? 0n;
      tokens.set(info.mint, current + BigInt(info.tokenAmount.amount));
    }
  }

  return { solLamports: BigInt(sol), tokens };
}
