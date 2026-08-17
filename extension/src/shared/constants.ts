export const WSOL = "So11111111111111111111111111111111111111112";
export const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ZK_ELGAMAL_PROOF_PROGRAM = "ZkE1Gama1Proof11111111111111111111111111111";

export const DEFAULT_RPC = "https://earth-solana.netlify.app/api/rpc";
const LEGACY_PUBLIC_RPCS = new Set([
  "https://api.mainnet-beta.solana.com",
  "https://api.mainnet.solana.com",
]);

export function resolveRpcUrl(stored?: string): string {
  const url = (stored ?? "").replace(/\/$/, "");
  if (!url || LEGACY_PUBLIC_RPCS.has(url)) return DEFAULT_RPC;
  return url;
}
/** 2% of every Earth Wallet send, paid to the protocol treasury. */
export const PROTOCOL_FEE_BPS = 200;
export const PROTOCOL_FEE_ADDRESS = "HrxWTCY2sb5DvpWWq8TbH37BRwDpc2xbQChYfKWEZG17";
export const DERIVATION_PATH = "m/44'/501'/0'/0'";
export const AUTO_LOCK_MINUTES = 15;
export const VAULT_ITERATIONS = 310_000;
export const MIN_PASSWORD = 8;
export const CLIPBOARD_CLEAR_MS = 60_000;

export const CHANNEL = "earth-wallet";
export const WALLET_NAME = "Earth Wallet";
export const WALLET_VERSION = "0.1.0";
