import { Buffer } from "buffer";
import { TOKEN_2022_PROGRAM, WSOL } from "./constants";
import { getRpcUrl } from "./solana";
import { isOnChainMint } from "./ids";
import { signAndSendTransaction } from "./wallet";

export { WSOL, isOnChainMint };

export async function getConnection() {
  const { Connection } = await import("@solana/web3.js");
  return new Connection(getRpcUrl(), "confirmed");
}

export async function confirmSignature(signature: string): Promise<void> {
  const connection = await getConnection();
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

export async function createTokenMint(input: {
  payer: string;
  destination: string;
  decimals: number;
  supply: bigint;
  transferFeeBps?: number;
}): Promise<{ mint: string; signature: string; standardId: "spl-token" | "token-2022" }> {
  if (!isOnChainMint(input.payer) || !isOnChainMint(input.destination)) {
    throw new Error("Connect Earth Wallet before creating a contract.");
  }
  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 9) {
    throw new Error("On-chain mints use 0–9 decimals.");
  }
  if (input.supply <= 0n) throw new Error("Total supply must be greater than 0.");

  const [{ Connection, Keypair, PublicKey, SystemProgram, Transaction }, spl] = await Promise.all([
    import("@solana/web3.js"),
    import("@solana/spl-token"),
  ]);

  const connection = new Connection(getRpcUrl(), "confirmed");
  const payer = new PublicKey(input.payer);
  const destination = new PublicKey(input.destination);
  const mintKp = Keypair.generate();
  const feeBps = Math.max(0, Math.min(2500, Math.floor(input.transferFeeBps ?? 0)));
  const token2022 = feeBps > 0;
  const programId = token2022 ? spl.TOKEN_2022_PROGRAM_ID : spl.TOKEN_PROGRAM_ID;
  const tx = new Transaction();

  if (token2022) {
    const mintLen = spl.getMintLen([spl.ExtensionType.TransferFeeConfig]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: mintKp.publicKey,
        space: mintLen,
        lamports,
        programId,
      }),
      spl.createInitializeTransferFeeConfigInstruction(
        mintKp.publicKey,
        payer,
        destination,
        feeBps,
        input.supply,
        programId,
      ),
      spl.createInitializeMintInstruction(mintKp.publicKey, input.decimals, payer, payer, programId),
    );
  } else {
    const lamports = await spl.getMinimumBalanceForRentExemptMint(connection);
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: mintKp.publicKey,
        space: spl.MINT_SIZE,
        lamports,
        programId,
      }),
      spl.createInitializeMintInstruction(mintKp.publicKey, input.decimals, payer, payer, programId),
    );
  }

  const ata = spl.getAssociatedTokenAddressSync(mintKp.publicKey, destination, false, programId);
  tx.add(
    spl.createAssociatedTokenAccountIdempotentInstruction(payer, ata, destination, mintKp.publicKey, programId),
    spl.createMintToInstruction(mintKp.publicKey, ata, payer, input.supply, [], programId),
  );
  tx.feePayer = payer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.partialSign(mintKp);

  const signature = await signAndSendTransaction(tx);
  await confirmSignature(signature);
  return {
    mint: mintKp.publicKey.toBase58(),
    signature,
    standardId: token2022 ? "token-2022" : "spl-token",
  };
}

export async function revokeMintAuthorities(input: {
  payer: string;
  mint: string;
  mintRevoked?: boolean;
  freezeRevoked?: boolean;
}): Promise<string | undefined> {
  if (!input.mintRevoked && !input.freezeRevoked) return undefined;
  const [{ Connection, PublicKey, Transaction }, spl] = await Promise.all([
    import("@solana/web3.js"),
    import("@solana/spl-token"),
  ]);
  const connection = new Connection(getRpcUrl(), "confirmed");
  const mint = new PublicKey(input.mint);
  const payer = new PublicKey(input.payer);
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info) throw new Error("That mint is not on-chain yet.");
  const programId = info.owner;
  const tx = new Transaction();
  if (input.mintRevoked) {
    tx.add(spl.createSetAuthorityInstruction(mint, payer, spl.AuthorityType.MintTokens, null, [], programId));
  }
  if (input.freezeRevoked) {
    tx.add(spl.createSetAuthorityInstruction(mint, payer, spl.AuthorityType.FreezeAccount, null, [], programId));
  }
  if (!tx.instructions.length) return undefined;
  tx.feePayer = payer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const signature = await signAndSendTransaction(tx);
  await confirmSignature(signature);
  return signature;
}

export async function sendAndConfirmEncoded(encoded: string): Promise<string> {
  const { Transaction, VersionedTransaction } = await import("@solana/web3.js");
  const bytes = Buffer.from(encoded, "base64");
  let tx: unknown;
  try {
    tx = VersionedTransaction.deserialize(bytes);
  } catch {
    tx = Transaction.from(bytes);
  }
  const signature = await signAndSendTransaction(tx);
  await confirmSignature(signature);
  return signature;
}

export function onChainStandardId(mintKind: "spl-token" | "token-2022" | string, mint: string): string {
  if (mintKind === TOKEN_2022_PROGRAM || mintKind === "token-2022") return "token-2022";
  if (isOnChainMint(mint)) return mintKind === "token-2022" ? "token-2022" : "spl-token";
  return "spl-token";
}

export function transferFeeBpsFromConfig(config?: Record<string, string | number | boolean>): number {
  if (!config) return 0;
  const keys = ["sellTaxBps", "buyTaxBps", "levyBps", "reflectionBps"];
  let max = 0;
  for (const key of keys) {
    const value = Number(config[key] ?? 0);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return Math.min(2500, Math.max(0, Math.floor(max)));
}
