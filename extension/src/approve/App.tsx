import { useEffect, useState } from "react";
import type { PendingRequest, PublicWalletState } from "../shared/types";
import { shortAddress } from "../shared/format";
import { hostLabel } from "../shared/security";
import { Mark } from "../popup/brand";
import { call } from "../popup/rpc";

function PasswordField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="password"
      value={value}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ApproveApp() {
  const id = new URLSearchParams(location.search).get("id") ?? undefined;
  const [pending, setPending] = useState<PendingRequest | null>();
  const [state, setState] = useState<PublicWalletState>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [nextState, nextPending] = await Promise.all([
          call<PublicWalletState>({ type: "GET_STATE" }),
          call<PendingRequest | null>({ type: "GET_PENDING", id }),
        ]);
        setState(nextState);
        setPending(nextPending);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load request");
      }
    })();
  }, [id]);

  async function unlock() {
    setBusy(true);
    setError(undefined);
    try {
      const next = await call<PublicWalletState>({ type: "UNLOCK", password });
      setState(next);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(approve: boolean) {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      await call({ type: "RESOLVE_PENDING", id: pending.id, approve });
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve");
      setBusy(false);
    }
  }

  const connect = pending?.kind === "connect";
  const title = connect
    ? "Connect to this app?"
    : pending?.kind === "signMessage"
      ? "Sign message"
      : pending?.kind === "signAndSendTransaction"
        ? "Approve transaction"
        : pending?.kind === "signAllTransactions"
          ? "Approve transactions"
          : "Approve transaction";

  return (
    <div className="shell">
      <div className="center" style={{ marginBottom: 12 }}>
        <div className="logo-wrap" style={{ width: 56, height: 56, marginBottom: 10 }}>
          <Mark size={34} />
        </div>
        <h1 className="welcome" style={{ fontSize: 20 }}>
          {title}
        </h1>
      </div>
      {error ? <p className="notice alert">{error}</p> : null}
      {!pending ? (
        <p className="lede">This request expired. You can close this window.</p>
      ) : (
        <div className="grow stack">
          <div className="site-card">
            <span className="host">{hostLabel(pending.origin)}</span>
            <span className="fine" style={{ margin: 0 }}>
              {pending.origin}
            </span>
          </div>
          {connect ? (
            <>
              <p className="lede">This app would like to:</p>
              <ul className="perms">
                <li>View your wallet address and balances</li>
                <li>Request approval for transactions and signatures</li>
              </ul>
              <p className="fine">Earth never shares your secret phrase or password. You approve every send.</p>
            </>
          ) : (
            <>
              {pending.preview ? <p className="notice">{pending.preview}</p> : null}
              {pending.message ? <p className="notice mono">{pending.message}</p> : null}
              {pending.simulation ? (
                <p className={`notice${pending.simulation.ok ? " ok" : " alert"}`}>{pending.simulation.detail}</p>
              ) : null}
            </>
          )}
          {state?.address ? <p className="fine">Wallet {shortAddress(state.address, 4)}</p> : null}
          {!state?.unlocked ? (
            <>
              <label>
                Password
                <PasswordField value={password} onChange={setPassword} />
              </label>
              <button type="button" className="primary" disabled={busy} onClick={() => void unlock()}>
                Unlock
              </button>
            </>
          ) : (
            <div className="row">
              <button type="button" className="ghost" disabled={busy} onClick={() => void resolve(false)}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => void resolve(true)}>
                {connect ? "Connect" : "Approve"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
