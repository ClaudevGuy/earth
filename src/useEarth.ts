import { useCallback, useEffect, useState } from "react";
import type { CatalogStandard, CurveKind, ListedToken, LpPosition, Pool, TokenStandard } from "./types";
import {
  catalogFromStandard,
  decodeShareCode,
  fetchCatalog,
  publishToCatalog,
  standardFromCatalog,
  type CatalogStatus,
} from "./adapters/catalog";
import { canRemoveStandard, findStandard, loadStandards, saveCustomStandards } from "./adapters/registry";
import { applyDeposit, applyWithdraw, createPool } from "./amm/engine";
import { findPool, loadPools, savePools } from "./amm/pools";
import { loadTokens, saveExtraTokens } from "./data/tokens";
import { assertFits, parseAmount } from "./lib/amounts";
import { makeId, previewMint, previewProgramId, validateDecimals, validateTicker } from "./lib/ids";
import { loadJson, saveJson } from "./lib/storage";
import { fetchBalances } from "./lib/solana";
import {
  connectEarthWallet,
  disconnectEarthWallet,
  isEarthWalletInstalled,
  subscribeEarthWallet,
} from "./lib/wallet";

export interface LaunchInput {
  standardName: string;
  programId: string;
  amountWidth: TokenStandard["amountWidth"];
  kind: TokenStandard["kind"];
  notes?: string;
  publish?: boolean;
  symbol?: string;
  tokenName?: string;
  mint?: string;
  decimals?: number;
  createPool: boolean;
  quoteMint: string;
  amountBase: string;
  amountQuote: string;
  curve: CurveKind;
  feeBps: number;
}

export function useEarth() {
  const [standards, setStandards] = useState<TokenStandard[]>(() => loadStandards());
  const [tokens, setTokens] = useState<ListedToken[]>(() => loadTokens());
  const [pools, setPools] = useState<Pool[]>(() => loadPools());
  const [positions, setPositions] = useState<LpPosition[]>(() => loadJson("lp", []));
  const [catalog, setCatalog] = useState<CatalogStandard[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("local");
  const [wallet, setWallet] = useState<string>();
  const [balances, setBalances] = useState<Map<string, bigint>>(new Map());
  const [balanceError, setBalanceError] = useState<string>();
  const [walletError, setWalletError] = useState<string>();
  const [earthInstalled, setEarthInstalled] = useState(() => isEarthWalletInstalled());

  useEffect(() => savePools(pools), [pools]);
  useEffect(() => saveCustomStandards(standards), [standards]);
  useEffect(() => saveExtraTokens(tokens), [tokens]);
  useEffect(() => saveJson("lp", positions), [positions]);
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      const next = await fetchCatalog();
      if (cancelled) return;
      setCatalog(next.standards);
      setCatalogStatus(next.status);
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const refresh = () => setEarthInstalled(isEarthWalletInstalled());
    window.addEventListener("earth#initialized", refresh);
    window.addEventListener("wallet-standard:register-wallet", refresh);
    refresh();
    return () => {
      window.removeEventListener("earth#initialized", refresh);
      window.removeEventListener("wallet-standard:register-wallet", refresh);
    };
  }, []);

  const refreshBalances = useCallback(async (owner: string) => {
    setBalanceError(undefined);
    try {
      const { tokens: map } = await fetchBalances(owner);
      setBalances(map);
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : "Balance fetch failed");
    }
  }, []);

  useEffect(() => {
    if (!earthInstalled) return;
    let cancelled = false;
    void (async () => {
      try {
        const address = await connectEarthWallet({ onlyIfTrusted: true });
        if (cancelled || !address) return;
        setWallet(address);
        await refreshBalances(address);
      } catch {
        /* silent reconnect — user can click Connect */
      }
    })();
    const unsub = subscribeEarthWallet((address) => {
      if (cancelled) return;
      setWallet(address);
      if (address) void refreshBalances(address);
      else setBalances(new Map());
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [earthInstalled, refreshBalances]);

  const connect = useCallback(async () => {
    setWalletError(undefined);
    try {
      const address = await connectEarthWallet();
      if (!address) throw new Error("Unlock Earth Wallet and approve this site.");
      setWallet(address);
      await refreshBalances(address);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not connect Earth Wallet");
    }
  }, [refreshBalances]);

  const disconnect = useCallback(async () => {
    setWalletError(undefined);
    await disconnectEarthWallet();
    setWallet(undefined);
    setBalances(new Map());
  }, []);

  const addTokenToStandard = useCallback(
    (standardId: string, input: { symbol: string; name: string; mint?: string; decimals: number }) => {
      let standard = findStandard(standardId, standards);
      if (!standard) {
        const row = catalog.find((s) => s.id === standardId);
        if (row) {
          standard = standardFromCatalog(row);
          setStandards((prev) => (prev.some((s) => s.id === standard!.id) ? prev : [...prev, standard!]));
        }
      }
      if (!standard) throw new Error("Unknown standard.");
      const tickerErr = validateTicker(input.symbol);
      if (tickerErr) throw new Error(tickerErr);
      const decErr = validateDecimals(input.decimals, standard.amountWidth);
      if (decErr) throw new Error(decErr);
      const symbol = input.symbol.trim().toUpperCase();
      const mint = input.mint?.trim() || previewMint(symbol);
      if (tokens.some((t) => t.mint === mint)) throw new Error("That mint is already listed.");
      if (tokens.some((t) => t.symbol.toUpperCase() === symbol && t.standardId === standardId)) {
        throw new Error("That ticker is already listed on this standard.");
      }
      const token: ListedToken = {
        mint,
        symbol,
        name: input.name.trim() || symbol,
        decimals: input.decimals,
        standardId,
        tags: ["user"],
      };
      setTokens((prev) => [...prev, token]);
      return token;
    },
    [catalog, standards, tokens],
  );

  const createPairPool = useCallback(
    (input: {
      tokenA: ListedToken;
      tokenB: ListedToken;
      amountA: bigint;
      amountB: bigint;
      curve: CurveKind;
      feeBps: number;
      widthA?: TokenStandard["amountWidth"];
      widthB?: TokenStandard["amountWidth"];
    }) => {
      if (input.tokenA.mint === input.tokenB.mint) throw new Error("Pick two different tokens.");
      if (input.amountA <= 0n || input.amountB <= 0n) throw new Error("Both amounts must be positive.");
      if (findPool(pools, input.tokenA.mint, input.tokenB.mint)) {
        throw new Error("A pool for this pair already exists. Add liquidity instead.");
      }
      const sa = findStandard(input.tokenA.standardId, standards);
      const sb = findStandard(input.tokenB.standardId, standards);
      assertFits(input.amountA, input.widthA ?? sa?.amountWidth ?? "u64");
      assertFits(input.amountB, input.widthB ?? sb?.amountWidth ?? "u64");
      const pool = createPool({
        tokenA: input.tokenA.mint,
        tokenB: input.tokenB.mint,
        amountA: input.amountA,
        amountB: input.amountB,
        curve: input.curve,
        feeBps: input.feeBps,
      });
      setPools((prev) => [...prev, pool]);
      setPositions((prev) => [...prev, { poolId: pool.id, shares: pool.lpSupply }]);
      return pool;
    },
    [pools, standards],
  );

  const launchStandard = useCallback(
    async (input: LaunchInput) => {
      const listing = Boolean(input.symbol?.trim());
      if (listing) {
        const tickerErr = validateTicker(input.symbol ?? "");
        if (tickerErr) throw new Error(tickerErr);
        const decErr = validateDecimals(input.decimals ?? 0, input.amountWidth);
        if (decErr) throw new Error(decErr);
      }
      if (!input.standardName.trim()) throw new Error("Give the standard a name.");

      const id = makeId("std");
      const programId = input.programId.trim() || previewProgramId(input.standardName);
      const symbol = input.symbol?.trim().toUpperCase() ?? "";
      const mint = listing ? input.mint?.trim() || previewMint(symbol) : "";
      if (mint && tokens.some((t) => t.mint === mint)) throw new Error("That mint is already listed.");

      const standard: TokenStandard = {
        id,
        name: input.standardName.trim(),
        kind: input.kind,
        programId,
        amountWidth: input.amountWidth,
        review: "unverified",
        userCreated: true,
        source: "created",
        published: false,
        publisher: wallet,
        createdAt: Date.now(),
        notes:
          input.notes?.trim() ||
          (input.programId.trim()
            ? "Registered by a user. Unverified — not an audit."
            : "Local preview standard (no on-chain program ID yet). Unverified — not an audit."),
      };

      let token: ListedToken | undefined;
      if (listing) {
        token = {
          mint,
          symbol,
          name: input.tokenName?.trim() || symbol,
          decimals: input.decimals ?? 0,
          standardId: id,
          tags: ["user"],
        };
      }

      let pool: Pool | undefined;
      if (listing && token && input.createPool) {
        const quote = tokens.find((t) => t.mint === input.quoteMint);
        if (!quote) throw new Error("Quote token not found.");
        pool = createPairPool({
          tokenA: token,
          tokenB: quote,
          amountA: parseAmount(input.amountBase || "0", token.decimals),
          amountB: parseAmount(input.amountQuote || "0", quote.decimals),
          curve: input.curve,
          feeBps: input.feeBps,
          widthA: input.amountWidth,
        });
      }

      let published = false;
      if (input.publish !== false) {
        try {
          const row = await publishToCatalog(catalogFromStandard(standard, wallet));
          standard.published = true;
          standard.id = row.id;
          if (token) token.standardId = row.id;
          published = true;
          setCatalog((prev) => {
            const rest = prev.filter((s) => s.id !== row.id && s.programId !== row.programId);
            return [...rest, row];
          });
        } catch {
          published = false;
        }
      }

      setStandards((prev) => [...prev, standard]);
      if (token) setTokens((prev) => [...prev, token]);
      return { standard, token, pool, published };
    },
    [createPairPool, tokens, wallet],
  );

  const adoptStandard = useCallback((entry: CatalogStandard | string) => {
    const catalogRow = typeof entry === "string" ? decodeShareCode(entry) : entry;
    const existing = standards.find((s) => s.id === catalogRow.id || s.programId === catalogRow.programId);
    if (existing) return existing;
    const standard = standardFromCatalog(catalogRow);
    setStandards((prev) => [...prev, standard]);
    setCatalog((prev) => (prev.some((s) => s.id === catalogRow.id) ? prev : [...prev, catalogRow]));
    return standard;
  }, [standards]);

  const publishStandard = useCallback(
    async (standardId: string) => {
      const standard = findStandard(standardId, standards);
      if (!standard) throw new Error("Unknown standard.");
      if (standard.source === "native") throw new Error("Native standards are already public.");
      const row = await publishToCatalog(catalogFromStandard(standard, wallet));
      setStandards((prev) =>
        prev.map((s) => (s.id === standardId ? { ...s, published: true, publisher: s.publisher ?? wallet } : s)),
      );
      setCatalog((prev) => {
        const rest = prev.filter((s) => s.id !== row.id && s.programId !== row.programId);
        return [...rest, row];
      });
      return row;
    },
    [standards, wallet],
  );

  const removeUserStandard = useCallback((standardId: string) => {
    const standard = findStandard(standardId, standards);
    if (!standard || !canRemoveStandard(standard)) throw new Error("Only user-added standards can be removed.");
    const mints = new Set(tokens.filter((t) => t.standardId === standardId).map((t) => t.mint));
    const poolIds = new Set(
      pools.filter((p) => mints.has(p.tokenA) || mints.has(p.tokenB)).map((p) => p.id),
    );
    setStandards((prev) => prev.filter((s) => s.id !== standardId));
    setTokens((prev) => prev.filter((t) => t.standardId !== standardId));
    setPools((prev) => prev.filter((p) => !poolIds.has(p.id)));
    setPositions((prev) => prev.filter((p) => !poolIds.has(p.poolId)));
  }, [pools, standards, tokens]);

  const depositToPool = useCallback((poolId: string, amountA: bigint, amountB: bigint) => {
    const existing = pools.find((p) => p.id === poolId);
    if (!existing) throw new Error("Pool not found.");
    const { pool, shares } = applyDeposit(existing, amountA, amountB);
    setPools((prev) => prev.map((p) => (p.id === pool.id ? pool : p)));
    setPositions((prev) => {
      const rest = prev.filter((p) => p.poolId !== pool.id);
      const held = prev.find((p) => p.poolId === pool.id);
      const next = (held ? BigInt(held.shares) : 0n) + shares;
      return [...rest, { poolId: pool.id, shares: next.toString() }];
    });
    return shares;
  }, [pools]);

  const withdrawFromPool = useCallback((poolId: string) => {
    const existing = pools.find((p) => p.id === poolId);
    const position = positions.find((p) => p.poolId === poolId);
    if (!existing || !position) throw new Error("No LP position on this pool.");
    const result = applyWithdraw(existing, BigInt(position.shares));
    setPools((prev) => prev.map((p) => (p.id === result.pool.id ? result.pool : p)));
    setPositions((prev) => prev.filter((p) => p.poolId !== poolId));
    return result;
  }, [pools, positions]);

  return {
    standards,
    setStandards,
    tokens,
    setTokens,
    pools,
    setPools,
    positions,
    setPositions,
    catalog,
    catalogStatus,
    wallet,
    earthInstalled,
    balances,
    balanceError,
    walletError,
    connect,
    disconnect,
    refreshBalances,
    launchStandard,
    adoptStandard,
    publishStandard,
    addTokenToStandard,
    createPairPool,
    removeUserStandard,
    depositToPool,
    withdrawFromPool,
  };
}

export type EarthState = ReturnType<typeof useEarth>;
