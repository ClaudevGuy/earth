export type AmountWidth = "u64" | "u128";
export type StandardKind = "spl-token" | "token-2022" | "custom";
export type ReviewStatus = "native" | "registered" | "unverified";

export interface TokenStandard {
  id: string;
  name: string;
  kind: StandardKind;
  programId: string;
  amountWidth: AmountWidth;
  review: ReviewStatus;
  notes: string;
  userCreated?: boolean;
  source?: "native" | "seeded" | "created" | "catalog";
  published?: boolean;
  publisher?: string;
}

export interface ListedToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  standardId: string;
  tags?: string[];
}

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  standardId: string;
  programId: string;
  amountWidth: AmountWidth;
  account?: string;
  frozen?: boolean;
  nonTransferable?: boolean;
  transferFeeBps?: number;
  nativeSol?: boolean;
  extensions: string[];
}

export interface ConnectedSite {
  origin: string;
  trusted: boolean;
  connectedAt: number;
}

export interface ActivityItem {
  signature: string;
  summary: string;
  at: number;
}

export interface PublicWalletState {
  hasVault: boolean;
  unlocked: boolean;
  address?: string;
  rpcUrl: string;
  autoLockMinutes: number;
  standards: TokenStandard[];
  tokens: ListedToken[];
  balances: TokenBalance[];
  sites: ConnectedSite[];
  activity: ActivityItem[];
  pendingBackup?: boolean;
  networkLabel: string;
  nonCustodial: true;
}

export interface PendingRequest {
  id: string;
  origin: string;
  kind: "connect" | "signTransaction" | "signAllTransactions" | "signMessage" | "signAndSendTransaction";
  message?: string;
  txCount?: number;
  preview?: string;
  simulation?: { ok: boolean; detail: string };
  createdAt: number;
}

export type PageMethod =
  | "connect"
  | "disconnect"
  | "signTransaction"
  | "signAllTransactions"
  | "signMessage"
  | "signAndSendTransaction"
  | "account";
