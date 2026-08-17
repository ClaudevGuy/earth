import { useCallback, useEffect, useState } from "react";
import type {
  CatalogStandard,
  CurveKind,
  LaunchpadCoin,
  LaunchpadHolding,
  ListedToken,
  LpPosition,
  Pool,
  RouteQuote,
  TokenLock,
  TokenSocials,
  TokenStandard,
} from "./types";
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
import { findPool, loadPools, mergeMarketPools, savePools } from "./amm/pools";
import { loadTokens, mergeMarketTokens, saveExtraTokens } from "./data/tokens";
import { assertFits, parseAmount } from "./lib/amounts";
import { isOnChainMint, makeId, previewProgramId, validateDecimals, validateTicker } from "./lib/ids";
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
import { createTokenMint, revokeMintAuthorities, sendAndConfirmEncoded, transferFeeBpsFromConfig } from "./lib/chain";
import { fetchMarket, positionsFor, publishMarket, settle, type MarketState } from "./lib/marketApi";
import { liveFills, setLiveFills } from "./market/tape";
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

function supplyFromConfig(config: ListedToken["config"] | undefined, decimals: number): bigint {
  const raw = String(config?.totalSupply ?? "1000000000");
  return parseAmount(raw, decimals);
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

  const applyMarket = useCallback((next: MarketState, owner?: string) => {
    setTokens(mergeMarketTokens([], next.tokens));
    setPools(mergeMarketPools([], next.pools));
    setLaunches(next.launches ?? []);
    setLaunchHoldings(next.holdings ?? []);
    setPositions(positionsFor(owner ?? wallet, next.lp ?? []));
    setLiveFills(next.tape ?? []);
  }, [wallet]);

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
    let cancelled = false;
    async function pull() {
      const next = await fetchMarket();
      if (cancelled) return;
      applyMarket(next, wallet);
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyMarket, wallet]);

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
        /* silent reconnect */
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

  const needWallet = useCallback(() => {
    if (!wallet) throw new Error("Connect Earth Wallet first.");
    return wallet;
  }, [wallet]);

  const pushMarket = useCallback(
    async (patch: Partial<MarketState>) => {
      const current = await fetchMarket();
      const next = await publishMarket({
        rev: current.rev,
        tokens: patch.tokens ?? current.tokens,
        pools: patch.pools ?? current.pools,
        launches: patch.launches ?? current.launches,
        holdings: patch.holdings ?? current.holdings,
        lp: patch.lp ?? current.lp,
        tape: patch.tape ?? current.tape ?? liveFills(),
      });
      applyMarket(next, wallet);
      return next;
    },
    [applyMarket, wallet],
  );

  const runSettle = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      const owner = needWallet();
      const prep = await settle(action, { ...payload, user: owner });
      if (prep.state) {
        applyMarket(prep.state, owner);
        return prep;
      }
      if (!prep.transaction || !prep.ticket) throw new Error("Earth could not build that transaction.");
      await sendAndConfirmEncoded(prep.transaction);
      const done = await settle("ack", { ticket: prep.ticket });
      if (done.state) applyMarket(done.state, owner);
      await refreshBalances(owner);
      return done;
    },
    [applyMarket, needWallet, refreshBalances],
  );

  const createPairPool = useCallback(
    async (input: {
      tokenA: ListedToken;
      tokenB: ListedToken;
      amountA: bigint;
      amountB: bigint;
      curve: CurveKind;
      feeBps: number;
      widthA?: TokenStandard["amountWidth"];
      widthB?: TokenStandard["amountWidth"];
      lockLp?: boolean;
      vault?: string;
    }) => {
      const owner = needWallet();
      if (input.tokenA.mint === input.tokenB.mint) throw new Error("Pick two different tokens.");
      if (input.amountA <= 0n || input.amountB <= 0n) throw new Error("Both amounts must be positive.");
      if (findPool(pools, input.tokenA.mint, input.tokenB.mint)) {
        throw new Error("A pool for this pair already exists. Add liquidity instead.");
      }
      const sa = findStandard(input.tokenA.standardId, standards);
      const sb = findStandard(input.tokenB.standardId, standards);
      assertFits(input.amountA, input.widthA ?? sa?.amountWidth ?? "u64");
      assertFits(input.amountB, input.widthB ?? sb?.amountWidth ?? "u64");
      const vault = input.vault || (await settle("allocVault", {})).vault;
      if (!vault) throw new Error("Could not open an Earth vault for this pool.");
      await runSettle("createPool", {
        vault,
        tokenA: input.tokenA.mint,
        tokenB: input.tokenB.mint,
        amountA: input.amountA.toString(),
        amountB: input.amountB.toString(),
        curve: input.curve,
        feeBps: input.feeBps,
      });
      const created = findPool(
        (await fetchMarket()).pools,
        input.tokenA.mint,
        input.tokenB.mint,
      );
      if (!created) throw new Error("Pool created on-chain but is not in the market yet. Refresh.");
      void owner;
      return created;
    },
    [needWallet, pools, runSettle, standards],
  );

  const addTokenToStandard = useCallback(
    async (standardId: string, input: {
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
      destination?: string;
      lockSupply?: boolean;
    }) => {
      const owner = needWallet();
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
      let mint = input.mint?.trim() || "";
      if (mint && !isOnChainMint(mint)) throw new Error("Paste a real Solana mint address, or leave it blank to mint on-chain.");
      if (!mint) {
        if (input.decimals > 9) throw new Error("On-chain contracts use 0–9 decimals. Lower decimals, or paste an existing mint.");
        const minted = await createTokenMint({
          payer: owner,
          destination: input.destination || owner,
          decimals: input.decimals,
          supply: supplyFromConfig(input.config, input.decimals),
          transferFeeBps: transferFeeBpsFromConfig(input.config),
        });
        mint = minted.mint;
        await refreshBalances(owner);
      }
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
        lock: { ...EMPTY_LOCK, mintRevoked: Boolean(input.lockSupply) },
        logo: input.logo,
        description: input.description?.trim() || undefined,
        socials: input.socials,
      };
      if (input.lockSupply) {
        await revokeMintAuthorities({ payer: owner, mint, mintRevoked: true }).catch(() => undefined);
      }
      const nextTokens = [...tokens, token];
      setTokens(nextTokens);

      let pool: Pool | undefined;
      if (input.createPool) {
        const quote = nextTokens.find((t) => t.mint === (input.quoteMint || WSOL));
        if (!quote) throw new Error("Quote token not found.");
        if (!input.amountBase || !input.amountQuote) throw new Error("Pool amounts are required.");
        pool = await createPairPool({
          tokenA: token,
          tokenB: quote,
          amountA: parseAmount(input.amountBase, token.decimals),
          amountB: parseAmount(input.amountQuote, quote.decimals),
          curve: input.curve ?? "constant-product",
          feeBps: input.feeBps ?? (asNumber(input.config ?? {}, "creatorFeeBps", 30) || 30),
          widthA: standard.amountWidth,
        });
      } else {
        await pushMarket({ tokens: nextTokens });
      }
      return { token, pool };
    },
    [catalog, createPairPool, needWallet, pushMarket, refreshBalances, standards, tokens],
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
      const id = nextStandardId([...standards.map((s) => s.id), ...catalog.map((s) => s.id)]);
      const programId = input.programId?.trim() || previewProgramId(input.standardName);
      const symbol = input.symbol?.trim().toUpperCase() ?? "";
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

      let published = false;
      if (input.publish !== false) {
        try {
          const row = await publishToCatalog(catalogFromStandard(standard, wallet));
          standard.published = true;
          standard.id = row.id;
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

      let token: ListedToken | undefined;
      let pool: Pool | undefined;
      if (listing) {
        const minted = await addTokenToStandard(standard.id, {
          symbol,
          name: input.tokenName?.trim() || symbol,
          mint: input.mint,
          decimals: input.decimals ?? 6,
          createPool: input.createPool,
          quoteMint: input.quoteMint,
          amountBase: input.amountBase,
          amountQuote: input.amountQuote,
          curve: input.curve,
          feeBps: input.feeBps,
        });
        token = minted.token;
        pool = minted.pool;
      }
      return { standard, token, pool, published };
    },
    [addTokenToStandard, catalog, wallet, standards],
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

  const depositToPool = useCallback(
    async (poolId: string, amountA: bigint, amountB: bigint) => {
      const existing = pools.find((p) => p.id === poolId);
      if (!existing?.vault) throw new Error("Pool not found.");
      await runSettle("deposit", {
        poolId,
        vault: existing.vault,
        amountA: amountA.toString(),
        amountB: amountB.toString(),
      });
      return amountA;
    },
    [pools, runSettle],
  );

  const withdrawFromPool = useCallback(
    async (poolId: string) => {
      const existing = pools.find((p) => p.id === poolId);
      if (!existing?.vault) throw new Error("No LP position on this pool.");
      await runSettle("withdraw", { poolId, vault: existing.vault });
      return { amountA: 0n, amountB: 0n, pool: existing };
    },
    [pools, runSettle],
  );

  const lockToken = useCallback(
    async (mint: string, kinds: Array<keyof TokenLock>) => {
      const owner = needWallet();
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
      await revokeMintAuthorities({
        payer: owner,
        mint,
        mintRevoked: kinds.includes("mintRevoked"),
        freezeRevoked: kinds.includes("freezeRevoked"),
      });
      const next = { ...token, lock };
      const nextTokens = tokens.map((t) => (t.mint === mint ? next : t));
      setTokens(nextTokens);
      await pushMarket({ tokens: nextTokens });
      return next;
    },
    [needWallet, pushMarket, tokens],
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
    async (input: {
      standardId: string;
      symbol: string;
      name: string;
      description: string;
      logo?: string;
      socials?: TokenSocials;
    }) => {
      const owner = needWallet();
      const standard = resolveLaunchStandard(input.standardId);
      const factory = findFactory(standard.id);
      const decimals = Math.min(factory?.defaultDecimals ?? 6, 9);
      const decErr = validateDecimals(decimals, standard.amountWidth);
      if (decErr) throw new Error(decErr);
      if (!input.name.trim()) throw new Error("Give the coin a name.");
      const description = input.description.trim();
      if (!description) throw new Error("Add a short description.");
      if (description.length > 500) throw new Error("Description must be 500 characters or fewer.");

      let config: ListedToken["config"];
      if (factory) {
        const values = fillAgentDefaults(defaultVariableValues(factory), owner);
        if (values.totalSupply != null) values.totalSupply = "1000000000";
        config = parseMintConfig(factory, values);
      }

      const vault = (await settle("allocVault", {})).vault;
      if (!vault) throw new Error("Could not open a launch vault.");
      const { token } = await addTokenToStandard(standard.id, {
        symbol: input.symbol,
        name: input.name,
        decimals,
        config,
        logo: input.logo,
        description,
        socials: input.socials,
        destination: vault,
        lockSupply: true,
      });

      const curve = initialCurve(token.decimals);
      const coin: LaunchpadCoin = {
        id: makeId("launch"),
        mint: token.mint,
        standardId: standard.id,
        creator: owner,
        createdAt: Date.now(),
        virtualSol: curve.virtualSol.toString(),
        virtualTokens: curve.virtualTokens.toString(),
        realSolRaised: "0",
        tokensSold: "0",
        graduationSol: curve.graduationSol.toString(),
        lpTokenReserve: lpTokenReserve(token.decimals).toString(),
        feeBps: curve.feeBps,
        graduated: false,
        vault,
      };
      const nextLaunches = [coin, ...launches];
      setLaunches(nextLaunches);
      await pushMarket({ tokens: [...tokens.filter((t) => t.mint !== token.mint), token], launches: nextLaunches });
      return { token, coin, standard };
    },
    [addTokenToStandard, launches, needWallet, pushMarket, resolveLaunchStandard, tokens],
  );

  const tradeLaunch = useCallback(
    async (mint: string, side: "buy" | "sell", rawAmount: string) => {
      const owner = needWallet();
      const coin = launches.find((row) => row.mint === mint);
      const token = tokens.find((t) => t.mint === mint);
      if (!coin?.vault || !token) throw new Error("Coin not found.");
      if (coin.graduated) throw new Error("This coin already graduated. Trade it on the Earth pool.");
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
      await runSettle("launchTrade", {
        mint,
        vault: coin.vault,
        side,
        amountIn: quote.amountIn.toString(),
        amountOut: quote.amountOut.toString(),
        virtualSol: quote.virtualSol.toString(),
        virtualTokens: quote.virtualTokens.toString(),
        realSolRaised: quote.realSolRaised.toString(),
        tokensSold: quote.tokensSold.toString(),
        graduates: quote.graduates,
      });
      let graduated = { ...coin, ...quote, graduated: quote.graduates };
      if (quote.graduates) {
        const done = await settle("graduate", { mint, user: owner });
        if (done.state) applyMarket(done.state, owner);
      }
      return { coin: graduated, quote, token, side };
    },
    [applyMarket, launches, needWallet, runSettle, tokens],
  );

  const executeRoute = useCallback(
    async (route: RouteQuote) => {
      needWallet();
      if (route.executable !== "earth") throw new Error("No executable Earth route.");
      for (const hop of route.hops) {
        if (!hop.poolId) continue;
        const pool = pools.find((p) => p.id === hop.poolId);
        if (!pool?.vault) throw new Error("Earth pool is missing its vault.");
        await runSettle("swap", {
          poolId: pool.id,
          vault: pool.vault,
          inMint: hop.inMint,
          outMint: hop.outMint,
          amountIn: hop.poolAmountIn ?? hop.amountIn,
          amountOut: hop.poolAmountOut ?? hop.amountOut,
        });
      }
    },
    [needWallet, pools, runSettle],
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
    executeRoute,
  };
}

export type EarthState = ReturnType<typeof useEarth>;
