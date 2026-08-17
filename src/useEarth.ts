import { useCallback, useEffect, useState } from "react";
import type { CatalogStandard, CurveKind, LaunchpadCoin, LaunchpadHolding, ListedToken, LpPosition, Pool, TokenLock, TokenSocials, TokenStandard } from "./types";
import {
  catalogFromStandard,
  decodeShareCode,
  fetchCatalog,
  fetchCatalogStandard,
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
import { nextStandardId } from "./lib/standardId";
import { loadJson, saveJson } from "./lib/storage";
import { WSOL } from "./lib/constants";
import { defaultVariableValues, findFactory } from "./standards/factories";
import { parseSourceCode } from "./standards/source";
import { asNumber, fillAgentDefaults, parseMintConfig } from "./standards/validate";
import { fetchBalances } from "./lib/solana";
import { canLockToken, EMPTY_LOCK, tokenLock } from "./lib/tokenSafety";
import {
  connectEarthWallet,
  disconnectEarthWallet,
  isEarthWalletInstalled,
  subscribeEarthWallet,
} from "./lib/wallet";
import { initialCurve, lpTokenReserve, quoteBuy, quoteSell } from "./launchpad/curve";

export interface LaunchInput {
  standardName: string;
  amountWidth: TokenStandard["amountWidth"];
  sourceCode: { filename?: string; code: string };
  notes?: string;
  publish?: boolean;
  programId?: string;
  kind?: TokenStandard["kind"];
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
  const [launches, setLaunches] = useState<LaunchpadCoin[]>(() => loadJson("launches", []));
  const [launchHoldings, setLaunchHoldings] = useState<LaunchpadHolding[]>(() => loadJson("launchHoldings", []));
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
  useEffect(() => saveJson("launches", launches), [launches]);
  useEffect(() => saveJson("launchHoldings", launchHoldings), [launchHoldings]);
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
      lockLp?: boolean;
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
      if (!input.lockLp) {
        setPositions((prev) => [...prev, { poolId: pool.id, shares: pool.lpSupply }]);
      }
      return pool;
    },
    [pools, standards],
  );

  const addTokenToStandard = useCallback(
    (standardId: string, input: {
      symbol: string;
      name: string;
      mint?: string;
      decimals: number;
      config?: ListedToken["config"];
      logo?: string;
      description?: string;
      socials?: TokenSocials;
      createPool?: boolean;
      quoteMint?: string;
      amountBase?: string;
      amountQuote?: string;
      curve?: CurveKind;
      feeBps?: number;
    }) => {
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
      const factory = findFactory(standardId);
      const tags = ["user"];
      if (factory?.standard.factory) tags.push(factory.standard.factory);
      if (input.logo || input.description || input.socials) tags.push("launchpad");
      const token: ListedToken = {
        mint,
        symbol,
        name: input.name.trim() || symbol,
        decimals: input.decimals,
        standardId,
        tags,
        config: input.config,
        lock: { ...EMPTY_LOCK },
        logo: input.logo,
        description: input.description?.trim() || undefined,
        socials: input.socials,
      };
      setTokens((prev) => [...prev, token]);

      let pool: Pool | undefined;
      const shouldPool = Boolean(input.createPool);
      if (shouldPool) {
        const quote = tokens.find((t) => t.mint === (input.quoteMint || WSOL));
        if (!quote) throw new Error("Quote token not found.");
        const amountBase = input.amountBase;
        const amountQuote = input.amountQuote;
        if (!amountBase || !amountQuote) throw new Error("Pool amounts are required.");
        pool = createPairPool({
          tokenA: token,
          tokenB: quote,
          amountA: parseAmount(amountBase, token.decimals),
          amountB: parseAmount(amountQuote, quote.decimals),
          curve: input.curve ?? "constant-product",
          feeBps: input.feeBps ?? (asNumber(input.config ?? {}, "creatorFeeBps", 30) || 30),
          widthA: standard.amountWidth,
        });
      }
      return { token, pool };
    },
    [catalog, createPairPool, standards, tokens],
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
      const sourceCode = parseSourceCode(input.sourceCode.filename, input.sourceCode.code);

      // Custom standards require burning $1,000 of $EARTH (quoted from the live price).
      // The mint is not set yet, so this protocol preview does not take tokens.

      const id = nextStandardId([...standards.map((s) => s.id), ...catalog.map((s) => s.id)]);
      const programId = input.programId?.trim() || previewProgramId(input.standardName);
      const symbol = input.symbol?.trim().toUpperCase() ?? "";
      const mint = listing ? input.mint?.trim() || previewMint(symbol) : "";
      if (mint && tokens.some((t) => t.mint === mint)) throw new Error("That contract is already listed.");

      const standard: TokenStandard = {
        id,
        name: input.standardName.trim(),
        kind: input.kind ?? "custom",
        programId,
        amountWidth: input.amountWidth,
        review: "unverified",
        userCreated: true,
        source: "created",
        published: false,
        publisher: wallet,
        createdAt: Date.now(),
        sourceCode,
        notes:
          input.notes?.trim() ||
          "Public source is on this card. Listing a standard burns $1,000 of $EARTH. Unverified — not an audit.",
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
          lock: { ...EMPTY_LOCK },
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
    [catalog, createPairPool, tokens, wallet, standards],
  );

  const adoptStandard = useCallback(async (entry: CatalogStandard | string) => {
    let catalogRow = typeof entry === "string" ? decodeShareCode(entry) : { ...entry };
    if (!catalogRow.sourceCode?.code) {
      const fromCatalog =
        catalog.find((s) => s.id === catalogRow.id || s.programId === catalogRow.programId) ??
        (await fetchCatalogStandard(catalogRow.id));
      if (fromCatalog?.sourceCode) catalogRow = { ...catalogRow, sourceCode: fromCatalog.sourceCode };
    }
    const existing = standards.find((s) => s.id === catalogRow.id || s.programId === catalogRow.programId);
    if (existing) {
      if (catalogRow.sourceCode && !existing.sourceCode) {
        setStandards((prev) =>
          prev.map((s) => (s.id === existing.id ? { ...s, sourceCode: catalogRow.sourceCode } : s)),
        );
        return { ...existing, sourceCode: catalogRow.sourceCode };
      }
      return existing;
    }
    const standard = standardFromCatalog(catalogRow);
    setStandards((prev) => [...prev, standard]);
    setCatalog((prev) => (prev.some((s) => s.id === catalogRow.id) ? prev : [...prev, catalogRow]));
    return standard;
  }, [catalog, standards]);

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

  const lockToken = useCallback(
    (mint: string, kinds: Array<keyof TokenLock>) => {
      const token = tokens.find((t) => t.mint === mint);
      if (!token) throw new Error("Token not found.");
      if (!canLockToken(token)) throw new Error("Only tokens you listed can be locked.");
      if (!kinds.length) throw new Error("Pick at least one lock.");
      const lock = tokenLock(token);
      for (const kind of kinds) {
        if (lock[kind]) {
          if (kind === "mintRevoked") throw new Error("Supply is already locked.");
          if (kind === "freezeRevoked") throw new Error("Freeze authority is already revoked.");
          throw new Error("Metadata is already immutable.");
        }
        lock[kind] = true;
      }
      const next = { ...token, lock };
      setTokens((prev) => prev.map((t) => (t.mint === mint ? next : t)));
      return next;
    },
    [tokens],
  );

  const resolveLaunchStandard = useCallback(
    (standardId: string): TokenStandard => {
      const id = standardId.trim();
      if (!id) throw new Error("Pick a token standard, or paste its ID.");
      let standard = findStandard(id, standards);
      if (!standard) {
        const row = catalog.find((s) => s.id === id || s.id.toLowerCase() === id.toLowerCase());
        if (row) {
          standard = standardFromCatalog(row);
          setStandards((prev) => (prev.some((s) => s.id === standard!.id) ? prev : [...prev, standard!]));
        }
      }
      if (!standard) throw new Error("That standard is not in the Earth registry.");
      return standard;
    },
    [catalog, standards],
  );

  const createLaunchCoin = useCallback(
    (input: {
      standardId: string;
      symbol: string;
      name: string;
      description: string;
      logo?: string;
      socials?: TokenSocials;
    }) => {
      const standard = resolveLaunchStandard(input.standardId);
      const factory = findFactory(standard.id);
      const decimals = factory?.defaultDecimals ?? 6;
      const decErr = validateDecimals(decimals, standard.amountWidth);
      if (decErr) throw new Error(decErr);
      if (!input.name.trim()) throw new Error("Give the coin a name.");
      const description = input.description.trim();
      if (!description) throw new Error("Add a short description.");
      if (description.length > 500) throw new Error("Description must be 500 characters or fewer.");

      let config: ListedToken["config"];
      if (factory) {
        const values = fillAgentDefaults(defaultVariableValues(factory), wallet);
        if (values.totalSupply != null) values.totalSupply = "1000000000";
        config = parseMintConfig(factory, values);
      }

      const { token } = addTokenToStandard(standard.id, {
        symbol: input.symbol,
        name: input.name,
        decimals,
        config,
        logo: input.logo,
        description,
        socials: input.socials,
      });

      const curve = initialCurve(token.decimals);
      const coin: LaunchpadCoin = {
        id: makeId("launch"),
        mint: token.mint,
        standardId: standard.id,
        creator: wallet,
        createdAt: Date.now(),
        virtualSol: curve.virtualSol.toString(),
        virtualTokens: curve.virtualTokens.toString(),
        realSolRaised: "0",
        tokensSold: "0",
        graduationSol: curve.graduationSol.toString(),
        lpTokenReserve: lpTokenReserve(token.decimals).toString(),
        feeBps: curve.feeBps,
        graduated: false,
      };
      setLaunches((prev) => [coin, ...prev]);
      return { token, coin, standard };
    },
    [addTokenToStandard, resolveLaunchStandard, wallet],
  );

  const graduateLaunch = useCallback(
    (coin: LaunchpadCoin, token: ListedToken) => {
      if (coin.graduated) return coin;
      const quote = tokens.find((t) => t.mint === WSOL);
      if (!quote) throw new Error("SOL is not listed.");
      const remainingCurve = BigInt(coin.virtualTokens);
      const reserved = BigInt(coin.lpTokenReserve);
      const solRaised = BigInt(coin.realSolRaised);
      if (remainingCurve + reserved <= 0n || solRaised <= 0n) {
        throw new Error("Not enough reserves to open the pool.");
      }
      const pool = createPairPool({
        tokenA: token,
        tokenB: quote,
        amountA: remainingCurve + reserved,
        amountB: solRaised,
        curve: "constant-product",
        feeBps: 30,
        lockLp: true,
      });
      const next: LaunchpadCoin = { ...coin, graduated: true, poolId: pool.id };
      setLaunches((prev) => prev.map((row) => (row.id === coin.id ? next : row)));
      return next;
    },
    [createPairPool, tokens],
  );

  const tradeLaunch = useCallback(
    (mint: string, side: "buy" | "sell", rawAmount: string) => {
      const coin = launches.find((row) => row.mint === mint);
      const token = tokens.find((t) => t.mint === mint);
      if (!coin || !token) throw new Error("Coin not found.");
      if (coin.graduated) throw new Error("This coin already graduated. Trade it on the Earth pool.");
      const owner = wallet ?? "local";
      const state = {
        virtualSol: BigInt(coin.virtualSol),
        virtualTokens: BigInt(coin.virtualTokens),
        realSolRaised: BigInt(coin.realSolRaised),
        tokensSold: BigInt(coin.tokensSold),
        graduationSol: BigInt(coin.graduationSol),
        feeBps: coin.feeBps,
      };
      const quote =
        side === "buy"
          ? quoteBuy(state, parseAmount(rawAmount, 9))
          : quoteSell(state, parseAmount(rawAmount, token.decimals));
      if (side === "sell") {
        const held = launchHoldings.find((h) => h.mint === mint && h.owner === owner);
        if (!held || BigInt(held.amount) < quote.amountIn) {
          throw new Error("You do not have that many tokens on this launch.");
        }
      }
      const next: LaunchpadCoin = {
        ...coin,
        virtualSol: quote.virtualSol.toString(),
        virtualTokens: quote.virtualTokens.toString(),
        realSolRaised: quote.realSolRaised.toString(),
        tokensSold: quote.tokensSold.toString(),
      };
      setLaunches((prev) => prev.map((row) => (row.id === coin.id ? next : row)));
      setLaunchHoldings((prev) => {
        const held = prev.find((h) => h.mint === mint && h.owner === owner);
        const delta = side === "buy" ? quote.amountOut : -quote.amountIn;
        const nextAmt = (held ? BigInt(held.amount) : 0n) + delta;
        if (nextAmt < 0n) throw new Error("You do not have enough of this coin.");
        const rest = prev.filter((h) => !(h.mint === mint && h.owner === owner));
        if (nextAmt === 0n) return rest;
        return [...rest, { mint, owner, amount: nextAmt.toString() }];
      });
      let graduated = next;
      if (quote.graduates) graduated = graduateLaunch(next, token);
      return { coin: graduated, quote, token, side };
    },
    [graduateLaunch, launchHoldings, launches, tokens, wallet],
  );

  return {
    standards,
    setStandards,
    tokens,
    setTokens,
    pools,
    setPools,
    positions,
    setPositions,
    launches,
    launchHoldings,
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
    lockToken,
    depositToPool,
    withdrawFromPool,
    createLaunchCoin,
    tradeLaunch,
  };
}

export type EarthState = ReturnType<typeof useEarth>;
