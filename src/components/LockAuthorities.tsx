import type { EarthState } from "../useEarth";
import type { ListedToken, TokenLock } from "../types";
import { isTokenSafe, remainingLocks, tokenLock } from "../lib/tokenSafety";
import { TokenAvatar } from "./TokenAvatar";

const STEPS: {
  key: keyof TokenLock;
  title: string;
  done: string;
  body: string;
  action: string;
}[] = [
  {
    key: "mintRevoked",
    title: "Lock supply",
    done: "Supply locked",
    body: "Nobody can create more tokens. The circulating amount is fixed.",
    action: "Lock supply",
  },
  {
    key: "freezeRevoked",
    title: "Revoke freeze authority",
    done: "Freeze revoked",
    body: "Nobody can freeze token accounts. Holders can always transfer.",
    action: "Revoke freeze",
  },
  {
    key: "metadataImmutable",
    title: "Make metadata immutable",
    done: "Metadata frozen",
    body: "Name, ticker, and URI cannot be changed after this.",
    action: "Freeze metadata",
  },
];

export function SafeBadge({ token }: { token: ListedToken }) {
  if (!isTokenSafe(token)) return null;
  return (
    <span className="pill safe" title="Supply locked, freeze revoked, metadata immutable">
      Safe
    </span>
  );
}

export function LockChips({ token }: { token: ListedToken }) {
  const lock = tokenLock(token);
  return (
    <span className="lock-chips">
      <span className={`pill${lock.mintRevoked ? " safe" : " warn"}`}>
        {lock.mintRevoked ? "Supply locked" : "Supply open"}
      </span>
      <span className={`pill${lock.freezeRevoked ? " safe" : " warn"}`}>
        {lock.freezeRevoked ? "Freeze revoked" : "Freeze live"}
      </span>
      <span className={`pill${lock.metadataImmutable ? " safe" : " warn"}`}>
        {lock.metadataImmutable ? "Metadata frozen" : "Metadata mutable"}
      </span>
      <SafeBadge token={token} />
    </span>
  );
}

export function LockAuthorities({
  earth,
  token,
  compact,
  onDone,
  onError,
}: {
  earth: EarthState;
  token: ListedToken;
  compact?: boolean;
  onDone?: (msg: string) => void;
  onError?: (msg: string) => void;
}) {
  const lock = tokenLock(token);
  const safe = isTokenSafe(token);
  const left = remainingLocks(token);

  async function run(kinds: Array<keyof TokenLock>) {
    onError?.("");
    try {
      const next = await earth.lockToken(token.mint, kinds);
      onDone?.(
        isTokenSafe(next)
          ? `${next.symbol} is Safe — supply locked, freeze revoked, metadata immutable. DEX shows the badge.`
          : `${next.symbol} lock updated. Finish the remaining steps to mark it Safe.`,
      );
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not lock.");
    }
  }

  return (
    <div className={`lock-authorities${compact ? " compact" : ""}`}>
      <div className="panel-head tight">
        <span className="lock-head">
          {compact ? null : <TokenAvatar symbol={token.symbol} logo={token.logo} size={22} />}
          {compact ? `Make ${token.symbol} Safe` : `Lock ${token.symbol}`}
        </span>
        {safe ? <span className="pill safe">Safe</span> : <span className="pill warn">Authorities live</span>}
      </div>
      <p className="notice" style={{ marginTop: compact ? 0 : undefined }}>
        Lock supply, revoke freeze, and freeze metadata so this token cannot be changed. These steps cannot be undone.
        {safe ? " All three are done — DEX marks this ticker Safe." : ""}
      </p>
      <div className="lock-steps">
        {STEPS.map((step) => {
          const done = lock[step.key];
          return (
            <div key={step.key} className={`lock-step${done ? " done" : ""}`}>
              <div>
                <strong>{done ? step.done : step.title}</strong>
                <div className="muted">{step.body}</div>
              </div>
              {done ? (
                <span className="pill safe">Done</span>
              ) : (
                <button type="button" className="ghost" onClick={() => void run([step.key])}>
                  {step.action}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {left.length ? (
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button type="button" className="primary" onClick={() => void run(left)}>
            Make {token.symbol} Safe
          </button>
        </div>
      ) : null}
    </div>
  );
}
