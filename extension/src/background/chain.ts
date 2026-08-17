import "../shared/polyfill";
import { Buffer } from "buffer";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { WalletKeypair } from "../shared/crypto";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createTransferCheckedWithFeeInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeConfig,
  unpackAccount,
  unpackMint,
  getExtensionTypes,
  ExtensionType,
  calculateFee,
  getMetadataPointerState,
  getTokenMetadata,
} from "@solana/spl-token";
import { BUILTIN_TOKENS, findStandard, findToken, isOnChainProgramId } from "../shared/adapters";
import { PROTOCOL_FEE_ADDRESS, PROTOCOL_FEE_BPS, WSOL } from "../shared/constants";
import { assertFits, base64ToBytes, bytesToBase64, splitProtocolFee } from "../shared/format";
import type { Collectible, ListedToken, TokenBalance, TokenStandard } from "../shared/types";
import { enrichCollectibles, isCollectibleMint } from "./collectibles";

const EXT_NAMES: Partial<Record<ExtensionType, string>> = {
  [ExtensionType.TransferFeeConfig]: "transfer-fee",
  [ExtensionType.TransferFeeAmount]: "transfer-fee",
  [ExtensionType.InterestBearingConfig]: "interest-bearing",
  [ExtensionType.NonTransferable]: "non-transferable",
  [ExtensionType.NonTransferableAccount]: "non-transferable",
  [ExtensionType.PermanentDelegate]: "permanent-delegate",
  [ExtensionType.MemoTransfer]: "memo-required",
  [ExtensionType.DefaultAccountState]: "default-account-state",
  [ExtensionType.ImmutableOwner]: "immutable-owner",
  [ExtensionType.MintCloseAuthority]: "mint-close-authority",
  [ExtensionType.TransferHook]: "transfer-hook",
  [ExtensionType.MetadataPointer]: "metadata",
  [ExtensionType.TokenMetadata]: "metadata",
  [ExtensionType.GroupPointer]: "token-group",
  [ExtensionType.GroupMemberPointer]: "token-member",
  [ExtensionType.TokenGroup]: "token-group",
  [ExtensionType.TokenGroupMember]: "token-member",
  [ExtensionType.ConfidentialTransferMint]: "confidential",
  [ExtensionType.ConfidentialTransferAccount]: "confidential",
  [ExtensionType.ScaledUiAmountConfig]: "scaled-ui",
  [ExtensionType.PausableConfig]: "pausable",
  [ExtensionType.PausableAccount]: "pausable",
};

function readU128LE(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + offset, 16);
  const lo = view.getBigUint64(0, true);
  const hi = view.getBigUint64(8, true);
  return lo + (hi << 64n);
}

function writeU128LE(amount: bigint): Uint8Array {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, amount & ((1n << 64n) - 1n), true);
  view.setBigUint64(8, amount >> 64n, true);
  return out;
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
  const connection = new Connection(rpcUrl, "confirmed");
  let ownerKey: PublicKey;
  try {
    ownerKey = new PublicKey(owner);
  } catch {
    throw new Error("Wallet address is invalid. Re-import the 12 or 24 word seed phrase.");
  }
  const rows: TokenBalance[] = [];
  const collectibles: Collectible[] = [];
  const seen = new Set<string>();

  const sol = await connection.getBalance(ownerKey);
  const solMeta = labelForMint(WSOL, listed);
  rows.push({
    mint: WSOL,
    symbol: "SOL",
    name: solMeta.name,
    decimals: 9,
    amount: sol.toString(),
    standardId: "spl-token",
    programId: SystemProgram.programId.toBase58(),
    amountWidth: "u64",
    extensions: ["native-sol"],
    nativeSol: true,
  });
  seen.add(`native:${WSOL}`);

  const native = [
    { programId: TOKEN_PROGRAM_ID, standardId: "spl-token" as const },
    { programId: TOKEN_2022_PROGRAM_ID, standardId: "token-2022" as const },
  ];

  for (const { programId, standardId } of native) {
    if (!findStandard(standardId, standards)) continue;
    try {
      const accounts = await connection.getParsedTokenAccountsByOwner(ownerKey, { programId });
      for (const { pubkey, account } of accounts.value) {
        const info = account.data.parsed.info as {
          mint: string;
          tokenAmount: { amount: string; decimals: number };
          state?: string;
        };
        if (seen.has(info.mint) && standardId === "spl-token" && info.mint !== WSOL) continue;
        const meta = labelForMint(info.mint, listed);
        if (info.mint === WSOL) {
          meta.symbol = "wSOL";
          meta.name = "Wrapped SOL";
        }
        const extensions: string[] = [];
        let frozen = info.state === "frozen";
        let nonTransferable = false;
        let transferFeeBps: number | undefined;
        if (standardId === "token-2022") {
          try {
            const mintAi = await connection.getAccountInfo(new PublicKey(info.mint));
            if (mintAi?.data) {
              const mint = unpackMint(new PublicKey(info.mint), mintAi, TOKEN_2022_PROGRAM_ID);
              for (const ext of getExtensionTypes(mint.tlvData)) {
                const name = EXT_NAMES[ext];
                if (name && !extensions.includes(name)) extensions.push(name);
              }
              const fee = getTransferFeeConfig(mint);
              if (fee) transferFeeBps = fee.newerTransferFee.transferFeeBasisPoints;
              if (extensions.includes("non-transferable")) nonTransferable = true;
              const pointer = getMetadataPointerState(mint);
              if (pointer?.metadataAddress) {
                const md = await getTokenMetadata(connection, pointer.metadataAddress);
                if (md?.symbol) meta.symbol = md.symbol;
                if (md?.name) meta.name = md.name;
              }
            }
            const unpacked = unpackAccount(pubkey, account, TOKEN_2022_PROGRAM_ID);
            frozen = unpacked.isFrozen;
          } catch {
            /* metadata is optional */
          }
        }
        if (isCollectibleMint(info.tokenAmount.decimals, info.tokenAmount.amount)) {
          collectibles.push({
            mint: info.mint,
            name: meta.name,
            symbol: meta.symbol,
            amount: info.tokenAmount.amount,
          });
          seen.add(info.mint);
          continue;
        }
        rows.push({
          mint: info.mint,
          symbol: meta.symbol,
          name: meta.name,
          decimals: info.tokenAmount.decimals || meta.decimals,
          amount: info.tokenAmount.amount,
          standardId,
          programId: programId.toBase58(),
          amountWidth: "u64",
          account: pubkey.toBase58(),
          frozen,
          nonTransferable,
          transferFeeBps,
          extensions,
        });
        seen.add(info.mint);
      }
    } catch (error) {
      console.warn("token scan failed", standardId, error);
    }
  }

  for (const standard of standards.filter((s) => s.kind === "custom")) {
    if (!isOnChainProgramId(standard.programId)) continue;
    try {
      let programId: PublicKey;
      try {
        programId = new PublicKey(standard.programId);
      } catch {
        continue;
      }
      const accounts = await connection.getProgramAccounts(programId, {
        filters: [{ memcmp: { offset: 32, bytes: owner } }],
      });
      for (const { pubkey, account } of accounts) {
        if (account.data.length < (standard.amountWidth === "u128" ? 80 : 72)) continue;
        const mint = new PublicKey(account.data.subarray(0, 32)).toBase58();
        const amount =
          standard.amountWidth === "u128"
            ? readU128LE(account.data, 64)
            : new DataView(account.data.buffer, account.data.byteOffset + 64, 8).getBigUint64(0, true);
        const meta = labelForMint(mint, listed);
        const listedTok = findToken(mint, listed);
        rows.push({
          mint,
          symbol: meta.symbol,
          name: meta.name,
          decimals: listedTok?.decimals ?? meta.decimals,
          amount: amount.toString(),
          standardId: standard.id,
          programId: standard.programId,
          amountWidth: standard.amountWidth,
          account: pubkey.toBase58(),
          extensions: ["custom-adapter", standard.amountWidth],
        });
      }
    } catch (error) {
      console.warn("custom adapter scan failed", standard.id, error);
    }
  }

  for (const token of listed) {
    if (seen.has(token.mint)) continue;
    const standard = findStandard(token.standardId, standards);
    if (!standard) continue;
    rows.push({
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      amount: "0",
      standardId: token.standardId,
      programId: standard.programId,
      amountWidth: standard.amountWidth,
      extensions: token.tags ?? [],
    });
  }

  return {
    tokens: rows,
    collectibles: await enrichCollectibles(rpcUrl, owner, collectibles),
  };
}

const PROTOCOL_FEE_OWNER = new PublicKey(PROTOCOL_FEE_ADDRESS);

async function shouldCollectSolFee(connection: Connection, feeLamports: bigint): Promise<boolean> {
  if (feeLamports <= 0n) return false;
  const info = await connection.getAccountInfo(PROTOCOL_FEE_OWNER, "confirmed");
  if (info) return true;
  const rent = BigInt(await connection.getMinimumBalanceForRentExemption(0));
  return feeLamports >= rent;
}

function appendSplTransfer(
  tx: Transaction,
  payer: PublicKey,
  destOwner: PublicKey,
  mint: PublicKey,
  amount: bigint,
  programId: PublicKey,
  decimals: number,
  mintTransferFee: bigint | null,
) {
  const source = getAssociatedTokenAddressSync(mint, payer, false, programId);
  const destination = getAssociatedTokenAddressSync(mint, destOwner, false, programId);
  tx.add(createAssociatedTokenAccountIdempotentInstruction(payer, destination, destOwner, mint, programId));
  if (mintTransferFee != null) {
    tx.add(
      createTransferCheckedWithFeeInstruction(
        source,
        mint,
        destination,
        payer,
        amount,
        decimals,
        mintTransferFee,
        [],
        programId,
      ),
    );
    return;
  }
  tx.add(
    createTransferCheckedInstruction(source, mint, destination, payer, amount, decimals, [], programId),
  );
}

function adapterTransferIx(
  programId: PublicKey,
  source: PublicKey,
  destAcc: PublicKey,
  mint: PublicKey,
  payer: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const data = new Uint8Array(17);
  data[0] = 1;
  data.set(writeU128LE(amount), 1);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destAcc, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function sendFunds(input: {
  rpcUrl: string;
  keypair: WalletKeypair;
  to: string;
  mint: string;
  amount: bigint;
  standard: TokenStandard;
  nativeSol?: boolean;
}): Promise<string> {
  const keypair = Keypair.fromSecretKey(input.keypair.secretKey);
  const dest = new PublicKey(input.to);
  const connection = new Connection(input.rpcUrl, "confirmed");
  assertFits(input.amount, input.standard.amountWidth);
  if (input.amount <= 0n) throw new Error("Amount must be positive.");

  const { net, fee: protocolFee } = splitProtocolFee(input.amount, PROTOCOL_FEE_BPS);
  const collectProtocol = protocolFee > 0n && !dest.equals(PROTOCOL_FEE_OWNER);

  const tx = new Transaction();
  const payer = keypair.publicKey;

  if (input.nativeSol) {
    const takeFee = collectProtocol && (await shouldCollectSolFee(connection, protocolFee));
    tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: dest, lamports: takeFee ? net : input.amount }));
    if (takeFee) {
      tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: PROTOCOL_FEE_OWNER, lamports: protocolFee }));
    }
  } else if (input.standard.kind === "spl-token" || input.standard.kind === "token-2022") {
    const programId = input.standard.kind === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mint = new PublicKey(input.mint);
    const mintInfo = await getMint(connection, mint, "confirmed", programId);
    const feeConfig = input.standard.kind === "token-2022" ? getTransferFeeConfig(mintInfo) : null;
    let epoch = 0n;
    if (feeConfig) {
      epoch = BigInt((await connection.getEpochInfo()).epoch);
    }
    const mintFeeFor = (amount: bigint) => {
      if (!feeConfig) return null;
      const actual = epoch >= feeConfig.newerTransferFee.epoch ? feeConfig.newerTransferFee : feeConfig.olderTransferFee;
      return calculateFee(actual, amount);
    };
    const recipientAmount = collectProtocol ? net : input.amount;
    appendSplTransfer(
      tx,
      payer,
      dest,
      mint,
      recipientAmount,
      programId,
      mintInfo.decimals,
      mintFeeFor(recipientAmount),
    );
    if (collectProtocol) {
      appendSplTransfer(
        tx,
        payer,
        PROTOCOL_FEE_OWNER,
        mint,
        protocolFee,
        programId,
        mintInfo.decimals,
        mintFeeFor(protocolFee),
      );
    }
  } else if (isOnChainProgramId(input.standard.programId)) {
    const programId = new PublicKey(input.standard.programId);
    const mintKey = new PublicKey(input.mint);
    const owned = await connection.getProgramAccounts(programId, {
      filters: [{ memcmp: { offset: 32, bytes: payer.toBase58() } }],
    });
    const source = owned.find((item) => new PublicKey(item.account.data.subarray(0, 32)).toBase58() === input.mint);
    if (!source) throw new Error("No adapter account for this mint.");
    const destOwned = await connection.getProgramAccounts(programId, {
      filters: [{ memcmp: { offset: 32, bytes: dest.toBase58() } }],
    });
    const destAcc = destOwned.find((item) => new PublicKey(item.account.data.subarray(0, 32)).toBase58() === input.mint);
    if (!destAcc) {
      throw new Error("Recipient has no account on this standard yet. They need an Earth-compatible wallet.");
    }
    let feeAcc: (typeof destOwned)[number] | undefined;
    if (collectProtocol) {
      const feeOwned = await connection.getProgramAccounts(programId, {
        filters: [{ memcmp: { offset: 32, bytes: PROTOCOL_FEE_OWNER.toBase58() } }],
      });
      feeAcc = feeOwned.find((item) => new PublicKey(item.account.data.subarray(0, 32)).toBase58() === input.mint);
    }
    const takeFee = Boolean(collectProtocol && feeAcc);
    tx.add(
      adapterTransferIx(
        programId,
        source.pubkey,
        destAcc.pubkey,
        mintKey,
        payer,
        takeFee ? net : input.amount,
      ),
    );
    if (takeFee && feeAcc) {
      tx.add(adapterTransferIx(programId, source.pubkey, feeAcc.pubkey, mintKey, payer, protocolFee));
    }
  } else {
    const mint = new PublicKey(input.mint);
    const info = await connection.getAccountInfo(mint, "confirmed");
    if (!info) throw new Error("This mint is not on-chain yet.");
    const programId = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const mintInfo = await getMint(connection, mint, "confirmed", programId);
    const feeConfig = programId.equals(TOKEN_2022_PROGRAM_ID) ? getTransferFeeConfig(mintInfo) : null;
    let epoch = 0n;
    if (feeConfig) epoch = BigInt((await connection.getEpochInfo()).epoch);
    const mintFeeFor = (amount: bigint) => {
      if (!feeConfig) return null;
      const actual = epoch >= feeConfig.newerTransferFee.epoch ? feeConfig.newerTransferFee : feeConfig.olderTransferFee;
      return calculateFee(actual, amount);
    };
    const recipientAmount = collectProtocol ? net : input.amount;
    appendSplTransfer(tx, payer, dest, mint, recipientAmount, programId, mintInfo.decimals, mintFeeFor(recipientAmount));
    if (collectProtocol) {
      appendSplTransfer(tx, payer, PROTOCOL_FEE_OWNER, mint, protocolFee, programId, mintInfo.decimals, mintFeeFor(protocolFee));
    }
  }

  tx.feePayer = payer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(keypair);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

export async function signEncodedTransaction(keypair: WalletKeypair, encoded: string): Promise<string> {
  const signer = Keypair.fromSecretKey(keypair.secretKey);
  const bytes = base64ToBytes(encoded);
  try {
    const tx = VersionedTransaction.deserialize(bytes);
    tx.sign([signer]);
    return bytesToBase64(tx.serialize());
  } catch {
    const tx = Transaction.from(bytes);
    tx.partialSign(signer);
    return bytesToBase64(tx.serialize({ requireAllSignatures: false }));
  }
}

export async function signAndSendEncoded(
  rpcUrl: string,
  keypair: WalletKeypair,
  encoded: string,
): Promise<{ signature: string; signed: string }> {
  const signer = Keypair.fromSecretKey(keypair.secretKey);
  const bytes = base64ToBytes(encoded);
  const connection = new Connection(rpcUrl, "confirmed");
  try {
    const tx = VersionedTransaction.deserialize(bytes);
    tx.sign([signer]);
    const raw = tx.serialize();
    const signature = await connection.sendRawTransaction(raw);
    return { signature, signed: bytesToBase64(raw) };
  } catch {
    const tx = Transaction.from(bytes);
    tx.partialSign(signer);
    const raw = tx.serialize({ requireAllSignatures: false });
    const signature = await connection.sendRawTransaction(raw);
    return { signature, signed: bytesToBase64(raw) };
  }
}

export function summarizeTransaction(encoded: string): string {
  const bytes = base64ToBytes(encoded);
  try {
    const tx = VersionedTransaction.deserialize(bytes);
    const n = tx.message.compiledInstructions.length;
    return `Versioned transaction · ${n} instruction${n === 1 ? "" : "s"}`;
  } catch {
    try {
      const tx = Transaction.from(bytes);
      const n = tx.instructions.length;
      return `Legacy transaction · ${n} instruction${n === 1 ? "" : "s"}`;
    } catch {
      return `Raw transaction · ${bytes.length} bytes`;
    }
  }
}

export async function simulateEncoded(rpcUrl: string, encoded: string): Promise<{ ok: boolean; detail: string }> {
  const connection = new Connection(rpcUrl, "confirmed");
  const bytes = base64ToBytes(encoded);
  try {
    const tx = VersionedTransaction.deserialize(bytes);
    const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    if (sim.value.err) return { ok: false, detail: JSON.stringify(sim.value.err) };
    return { ok: true, detail: `Simulation succeeded${sim.value.unitsConsumed ? ` · ${sim.value.unitsConsumed} CU` : ""}` };
  } catch {
    try {
      const tx = Transaction.from(bytes);
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) return { ok: false, detail: JSON.stringify(sim.value.err) };
      return { ok: true, detail: "Simulation succeeded" };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "Could not simulate" };
    }
  }
}
