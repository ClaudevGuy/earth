import type { AmountWidth, ListedToken, PageMethod, PendingRequest, PublicWalletState, StandardKind } from "./types";

export type PopupRequest =
  | { type: "GET_STATE" }
  | { type: "CREATE_WALLET" }
  | { type: "CONFIRM_BACKUP"; indexes: number[]; words: string[] }
  | { type: "FINISH_CREATE"; password: string }
  | { type: "IMPORT_WALLET"; mnemonic: string; password: string }
  | { type: "UNLOCK"; password: string }
  | { type: "LOCK" }
  | { type: "PING" }
  | { type: "REFRESH" }
  | { type: "SEND"; mint: string; to: string; amount: string; standardId: string; nativeSol?: boolean }
  | { type: "REGISTER_STANDARD"; name: string; programId: string; kind: StandardKind; amountWidth: AmountWidth; notes?: string }
  | {
      type: "ADOPT_STANDARD";
      id: string;
      name: string;
      programId: string;
      kind: StandardKind;
      amountWidth: AmountWidth;
      notes?: string;
    }
  | { type: "ADD_TOKEN"; standardId: string; symbol: string; name: string; mint: string; decimals: number }
  | { type: "REMOVE_STANDARD"; standardId: string }
  | { type: "SET_RPC"; url: string }
  | { type: "SET_AUTOLOCK"; minutes: number }
  | { type: "EXPORT_SEED"; password: string }
  | { type: "FORGET_SITE"; origin: string }
  | { type: "GET_PENDING"; id?: string }
  | { type: "RESOLVE_PENDING"; id: string; approve: boolean };

export type PopupResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export type PageRequest = {
  type: "PAGE";
  method: PageMethod;
  origin: string;
  id: string;
  params?: Record<string, string | string[] | boolean | undefined>;
};

export type BackgroundToPage = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  event?: "connect" | "disconnect" | "accountChanged";
  address?: string | null;
};

export type CreateWalletPreview = {
  mnemonic: string;
  address: string;
  indexes: number[];
};

export type SendResult = { signature: string };

export type { PublicWalletState, PendingRequest, ListedToken };
