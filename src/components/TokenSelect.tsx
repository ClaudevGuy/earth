import { useMemo, useState } from "react";
import type { ListedToken, TokenStandard } from "../types";
import { findStandard } from "../adapters/registry";
import { shortAddress } from "../lib/format";
import { TokenAvatar } from "./TokenAvatar.tsx";

export function TokenSelect({
  tokens,
  standards,
  value,
  onChange,
}: {
  tokens: ListedToken[];
  standards: TokenStandard[];
  value: ListedToken;
  onChange: (token: ListedToken) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = needle
      ? tokens.filter(
          (t) =>
            t.symbol.toLowerCase().includes(needle) ||
            t.name.toLowerCase().includes(needle) ||
            t.mint.toLowerCase().includes(needle),
        )
      : tokens;
    return [...match].sort((a, b) => Number(Boolean(b.tags?.includes("user"))) - Number(Boolean(a.tags?.includes("user"))));
  }, [q, tokens]);

  const standard = findStandard(value.standardId, standards);

  return (
    <>
      <button type="button" className="token-pick" onClick={() => setOpen(true)}>
        <TokenAvatar symbol={value.symbol} size={28} />
        <span>
          <strong>{value.symbol}</strong>
          <small>{standard?.name ?? value.standardId}</small>
        </span>
        <span className="chevron">▾</span>
      </button>
      {open ? (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="panel modal pad" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <span>Select token</span>
              <button type="button" className="ghost" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <input
              className="search-field"
              autoFocus
              placeholder="Search symbol, name, or mint"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div>
              {filtered.map((token) => {
                const std = findStandard(token.standardId, standards);
                return (
                  <button
                    key={token.mint}
                    type="button"
                    className="token-option"
                    onClick={() => {
                      onChange(token);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <span className="token-option-main">
                      <TokenAvatar symbol={token.symbol} size={32} />
                      <span>
                        <strong>{token.symbol}</strong>
                        <div className="muted">{token.name}</div>
                      </span>
                    </span>
                    <span className="mono muted">
                      {std?.name}
                      <div>{shortAddress(token.mint, 5)}</div>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
