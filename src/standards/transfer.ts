import type { ListedToken } from "../types";
import { asNumber } from "./validate";

export type LevyKind = "buy" | "sell" | "transfer";

export interface LevySplit {
  gross: bigint;
  toRecipient: bigint;
  burned: bigint;
  reflected: bigint;
  creator: bigint;
  treasury: bigint;
}

function empty(amount: bigint): LevySplit {
  return { gross: amount, toRecipient: amount, burned: 0n, reflected: 0n, creator: 0n, treasury: 0n };
}

function takeBps(amount: bigint, bps: number): bigint {
  if (bps <= 0) return 0n;
  return (amount * BigInt(Math.floor(bps))) / 10_000n;
}

export function applyTransferLevy(token: ListedToken | undefined, amount: bigint, kind: LevyKind): LevySplit {
  if (!token?.config || amount <= 0n) return empty(amount);
  const factory = String(token.config.factory ?? token.standardId.replace(/^earth-/, ""));
  const c = token.config;

  if (factory === "memecoin") {
    const taxBps = kind === "buy" ? asNumber(c, "buyTaxBps") : asNumber(c, "sellTaxBps");
    const tax = takeBps(amount, taxBps);
    const burned = takeBps(tax, asNumber(c, "burnShareBps"));
    let creator = takeBps(tax, asNumber(c, "creatorShareBps"));
    if (burned + creator > tax) creator = tax - burned;
    return {
      gross: amount,
      toRecipient: amount - tax,
      burned,
      reflected: 0n,
      creator,
      treasury: 0n,
    };
  }

  if (factory === "reflect") {
    const reflection = takeBps(amount, asNumber(c, "reflectionBps"));
    const burned = takeBps(amount, asNumber(c, "burnBps"));
    const treasury = takeBps(amount, asNumber(c, "treasuryBps"));
    const tax = reflection + burned + treasury;
    return {
      gross: amount,
      toRecipient: amount - tax,
      burned,
      reflected: reflection,
      creator: 0n,
      treasury,
    };
  }

  if (factory === "agent") {
    const tax = takeBps(amount, asNumber(c, "levyBps"));
    return {
      gross: amount,
      toRecipient: amount - tax,
      burned: 0n,
      reflected: 0n,
      creator: 0n,
      treasury: tax,
    };
  }

  return empty(amount);
}

export function levyNote(token: ListedToken | undefined, kind: LevyKind): string | undefined {
  if (!token?.config) return undefined;
  const split = applyTransferLevy(token, 10_000n, kind);
  if (split.toRecipient === 10_000n) return undefined;
  const bps = Number(10_000n - split.toRecipient);
  const factory = String(token.config?.factory ?? token.standardId.replace(/^earth-/, ""));
  const label =
    factory === "agent"
      ? "agent levy"
      : kind === "buy"
        ? "buy tax"
        : kind === "sell"
          ? "sell tax"
          : "transfer levy";
  return `${token.symbol} ${label} ${bps / 100}%`;
}
