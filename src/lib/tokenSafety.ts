import type { ListedToken, TokenLock } from "../types";

export const EMPTY_LOCK: TokenLock = {
  mintRevoked: false,
  freezeRevoked: false,
  metadataImmutable: false,
};

export function tokenLock(token: ListedToken): TokenLock {
  return {
    mintRevoked: Boolean(token.lock?.mintRevoked),
    freezeRevoked: Boolean(token.lock?.freezeRevoked),
    metadataImmutable: Boolean(token.lock?.metadataImmutable),
  };
}

/** Tokens you listed can have supply / freeze / metadata locked from the Earth UI. */
export function canLockToken(token: ListedToken): boolean {
  return Boolean(token.tags?.includes("user"));
}

export function isTokenSafe(token: ListedToken): boolean {
  const lock = tokenLock(token);
  return lock.mintRevoked && lock.freezeRevoked && lock.metadataImmutable;
}

export function lockableInPair(a?: ListedToken, b?: ListedToken): ListedToken | undefined {
  if (a && canLockToken(a)) return a;
  if (b && canLockToken(b)) return b;
}

export function remainingLocks(token: ListedToken): Array<keyof TokenLock> {
  const lock = tokenLock(token);
  const left: Array<keyof TokenLock> = [];
  if (!lock.mintRevoked) left.push("mintRevoked");
  if (!lock.freezeRevoked) left.push("freezeRevoked");
  if (!lock.metadataImmutable) left.push("metadataImmutable");
  return left;
}
