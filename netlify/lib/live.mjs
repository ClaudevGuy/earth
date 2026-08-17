import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";

const WSOL = "So11111111111111111111111111111111111111112";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

export function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

export function emptyState() {
  return { rev: 0, tokens: [], pools: [], launches: [], holdings: [], lp: [], tape: [] };
}

export function publicState(state) {
  return {
    rev: state.rev ?? 0,
    tokens: state.tokens ?? [],
    pools: (state.pools ?? []).map((p) => ({ ...p })),
    launches: (state.launches ?? []).map((c) => ({ ...c })),
    holdings: state.holdings ?? [],
    lp: state.lp ?? [],
    tape: (state.tape ?? []).slice(0, 240),
  };
}

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function fromB64(value) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function isWsol(mint) {
  return mint === WSOL;
}

async function programForMint(connection, mint) {
  const info = await connection.getAccountInfo(new PublicKey(mint), "confirmed");
  if (!info) throw new Error("Mint is not on-chain.");
  return info.owner;
}

async function transferIx(connection, from, to, mint, amount, ownerIsVault, vaultPk, userPk) {
  if (isWsol(mint)) {
    return [
      SystemProgram.transfer({
        fromPubkey: ownerIsVault ? vaultPk : userPk,
        toPubkey: ownerIsVault ? userPk : vaultPk,
        lamports: Number(amount),
      }),
    ];
  }
  const mintPk = new PublicKey(mint);
  const programId = await programForMint(connection, mint);
  const mintInfo = await getMint(connection, mintPk, "confirmed", programId);
  const sourceOwner = ownerIsVault ? vaultPk : userPk;
  const destOwner = ownerIsVault ? userPk : vaultPk;
  const source = getAssociatedTokenAddressSync(mintPk, sourceOwner, false, programId);
  const dest = getAssociatedTokenAddressSync(mintPk, destOwner, false, programId);
  const payer = userPk;
  return [
    createAssociatedTokenAccountIdempotentInstruction(payer, dest, destOwner, mintPk, programId),
    createAssociatedTokenAccountIdempotentInstruction(payer, source, sourceOwner, mintPk, programId),
    createTransferCheckedInstruction(source, mintPk, dest, sourceOwner, amount, mintInfo.decimals, [], programId),
  ];
}

async function buildTx(rpcUrl, vault, user, ixs) {
  const connection = new Connection(rpcUrl, "confirmed");
  const tx = new Transaction();
  for (const ix of ixs) tx.add(ix);
  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.partialSign(vault);
  return b64(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

function ticketId() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pruneTickets(tickets) {
  const now = Date.now();
  const next = {};
  for (const [id, row] of Object.entries(tickets || {})) {
    if (row && row.expires > now) next[id] = row;
  }
  return next;
}

function applyPatch(state, patch) {
  const next = publicState(state);
  next.rev = (next.rev || 0) + 1;
  if (patch.tokens) {
    const keep = new Set(patch.tokens.map((t) => t.mint));
    next.tokens = [...next.tokens.filter((t) => !keep.has(t.mint)), ...patch.tokens];
  }
  if (patch.pools) {
    const keep = new Set(patch.pools.map((p) => p.id));
    next.pools = [...next.pools.filter((p) => !keep.has(p.id)), ...patch.pools];
  }
  if (patch.removePoolIds) {
    const drop = new Set(patch.removePoolIds);
    next.pools = next.pools.filter((p) => !drop.has(p.id));
    next.lp = next.lp.filter((p) => !drop.has(p.poolId));
  }
  if (patch.launches) {
    const keep = new Set(patch.launches.map((c) => c.id));
    next.launches = [...next.launches.filter((c) => !keep.has(c.id)), ...patch.launches];
  }
  if (patch.holdings) next.holdings = patch.holdings;
  if (patch.holding) {
    const row = patch.holding;
    const rest = next.holdings.filter((h) => !(h.mint === row.mint && h.owner === row.owner));
    next.holdings = BigInt(row.amount) === 0n ? rest : [...rest, row];
  }
  if (patch.lp) {
    const row = patch.lp;
    const rest = next.lp.filter((p) => !(p.poolId === row.poolId && p.owner === row.owner));
    next.lp = BigInt(row.shares) === 0n ? rest : [...rest, row];
  }
  if (patch.tape) next.tape = [patch.tape, ...next.tape].slice(0, 240);
  return next;
}

export async function handleMarket(event, storage) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod === "GET") {
    const state = (await storage.getJSON("state")) || emptyState();
    return json(200, publicState(state));
  }
  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON." });
    }
    const current = (await storage.getJSON("state")) || emptyState();
    const incomingRev = Number(body.rev) || 0;
    if (incomingRev && incomingRev < (current.rev || 0)) {
      return json(200, publicState(current));
    }
    const next = {
      ...emptyState(),
      ...current,
      tokens: Array.isArray(body.tokens) ? body.tokens : current.tokens,
      pools: Array.isArray(body.pools) ? body.pools : current.pools,
      launches: Array.isArray(body.launches) ? body.launches : current.launches,
      holdings: Array.isArray(body.holdings) ? body.holdings : current.holdings,
      lp: Array.isArray(body.lp) ? body.lp : current.lp,
      tape: Array.isArray(body.tape) ? body.tape : current.tape,
      rev: Math.max(current.rev || 0, incomingRev) + 1,
    };
    await storage.setJSON("state", next);
    return json(200, publicState(next));
  }
  return json(405, { error: "method not allowed" });
}

export async function handleSettle(event, storage, rpcUrl) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON." });
  }
  const action = String(body.action || "");
  const state = (await storage.getJSON("state")) || emptyState();
  const vaults = (await storage.getJSON("vaults")) || {};
  let tickets = pruneTickets((await storage.getJSON("tickets")) || {});

  try {
    if (action === "allocVault") {
      const kp = Keypair.generate();
      vaults[kp.publicKey.toBase58()] = b64(kp.secretKey);
      await storage.setJSON("vaults", vaults);
      return json(200, { vault: kp.publicKey.toBase58() });
    }

    if (action === "ack") {
      const ticket = tickets[body.ticket];
      if (!ticket) return json(400, { error: "That trade expired. Quote again." });
      delete tickets[body.ticket];
      const next = applyPatch(state, ticket.patch);
      await storage.setJSON("state", next);
      await storage.setJSON("tickets", tickets);
      return json(200, { state: publicState(next) });
    }

    if (action === "graduate") {
      const coin = (state.launches || []).find((c) => c.mint === body.mint);
      if (!coin) throw new Error("Coin not found.");
      if (coin.graduated && coin.poolId) return json(200, { state: publicState(state) });
      const remaining = BigInt(coin.virtualTokens) + BigInt(coin.lpTokenReserve);
      const solRaised = BigInt(coin.realSolRaised);
      if (remaining <= 0n || solRaised <= 0n) throw new Error("Not enough reserves to open the pool.");
      const shares = sqrt(remaining * solRaised);
      const pool = {
        id: body.poolId || `earth-${Date.now().toString(36)}`,
        tokenA: coin.mint,
        tokenB: WSOL,
        reserveA: remaining.toString(),
        reserveB: solRaised.toString(),
        lpSupply: shares.toString(),
        feeBps: 30,
        curve: "constant-product",
        venue: "earth-cpmm",
        vault: coin.vault,
        creator: coin.creator,
        locked: true,
      };
      const next = applyPatch(state, {
        launches: [{ ...coin, graduated: true, poolId: pool.id }],
        pools: [pool],
      });
      await storage.setJSON("state", next);
      return json(200, { state: publicState(next) });
    }

    const user = new PublicKey(String(body.user || ""));
    const connection = new Connection(rpcUrl, "confirmed");

    if (action === "createPool" || action === "deposit" || action === "swap" || action === "withdraw" || action === "launchTrade") {
      const vaultPk = new PublicKey(String(body.vault || body.vaultPubkey || ""));
      const secret = vaults[vaultPk.toBase58()];
      if (!secret) throw new Error("Unknown Earth vault.");
      const vault = Keypair.fromSecretKey(fromB64(secret));
      const ixs = [];
      let patch = {};

      if (action === "createPool") {
        const amountA = BigInt(body.amountA);
        const amountB = BigInt(body.amountB);
        if (amountA <= 0n || amountB <= 0n) throw new Error("Both amounts must be positive.");
        ixs.push(...(await transferIx(connection, user, vault.publicKey, body.tokenA, amountA, false, vault.publicKey, user)));
        ixs.push(...(await transferIx(connection, user, vault.publicKey, body.tokenB, amountB, false, vault.publicKey, user)));
        const shares = sqrt(amountA * amountB);
        const pool = {
          id: body.poolId || `earth-${Date.now().toString(36)}`,
          tokenA: body.tokenA,
          tokenB: body.tokenB,
          reserveA: amountA.toString(),
          reserveB: amountB.toString(),
          lpSupply: shares.toString(),
          feeBps: Number(body.feeBps) || 30,
          curve: body.curve === "stable" ? "stable" : "constant-product",
          venue: body.curve === "stable" ? "earth-stable" : "earth-cpmm",
          vault: vault.publicKey.toBase58(),
          creator: user.toBase58(),
        };
        patch = { pools: [pool], lp: { poolId: pool.id, owner: user.toBase58(), shares: shares.toString() } };
      } else if (action === "deposit") {
        const pool = (state.pools || []).find((p) => p.id === body.poolId);
        if (!pool) throw new Error("Pool not found.");
        const amountA = BigInt(body.amountA);
        const amountB = BigInt(body.amountB);
        ixs.push(...(await transferIx(connection, user, vault.publicKey, pool.tokenA, amountA, false, vault.publicKey, user)));
        ixs.push(...(await transferIx(connection, user, vault.publicKey, pool.tokenB, amountB, false, vault.publicKey, user)));
        const supply = BigInt(pool.lpSupply);
        const shares = supply === 0n ? sqrt(amountA * amountB) : (amountA * supply) / BigInt(pool.reserveA);
        const held = (state.lp || []).find((p) => p.poolId === pool.id && p.owner === user.toBase58());
        const nextShares = (held ? BigInt(held.shares) : 0n) + shares;
        patch = {
          pools: [
            {
              ...pool,
              reserveA: (BigInt(pool.reserveA) + amountA).toString(),
              reserveB: (BigInt(pool.reserveB) + amountB).toString(),
              lpSupply: (supply + shares).toString(),
            },
          ],
          lp: { poolId: pool.id, owner: user.toBase58(), shares: nextShares.toString() },
        };
      } else if (action === "withdraw") {
        const pool = (state.pools || []).find((p) => p.id === body.poolId);
        const held = (state.lp || []).find((p) => p.poolId === body.poolId && p.owner === user.toBase58());
        if (!pool || !held) throw new Error("No LP position on this pool.");
        if (pool.locked) throw new Error("This pool’s LP is locked.");
        const shares = BigInt(held.shares);
        const supply = BigInt(pool.lpSupply);
        const amountA = (shares * BigInt(pool.reserveA)) / supply;
        const amountB = (shares * BigInt(pool.reserveB)) / supply;
        ixs.push(...(await transferIx(connection, vault.publicKey, user, pool.tokenA, amountA, true, vault.publicKey, user)));
        ixs.push(...(await transferIx(connection, vault.publicKey, user, pool.tokenB, amountB, true, vault.publicKey, user)));
        const nextSupply = supply - shares;
        patch = {
          pools: [
            {
              ...pool,
              reserveA: (BigInt(pool.reserveA) - amountA).toString(),
              reserveB: (BigInt(pool.reserveB) - amountB).toString(),
              lpSupply: nextSupply.toString(),
            },
          ],
          lp: { poolId: pool.id, owner: user.toBase58(), shares: "0" },
        };
      } else if (action === "swap") {
        const pool = (state.pools || []).find((p) => p.id === body.poolId);
        if (!pool) throw new Error("Pool not found.");
        const amountIn = BigInt(body.amountIn);
        const amountOut = BigInt(body.amountOut);
        if (amountIn <= 0n || amountOut <= 0n) throw new Error("Invalid swap size.");
        ixs.push(...(await transferIx(connection, user, vault.publicKey, body.inMint, amountIn, false, vault.publicKey, user)));
        ixs.push(...(await transferIx(connection, vault.publicKey, user, body.outMint, amountOut, true, vault.publicKey, user)));
        const aIn = pool.tokenA === body.inMint;
        patch = {
          pools: [
            {
              ...pool,
              reserveA: (aIn ? BigInt(pool.reserveA) + amountIn : BigInt(pool.reserveA) - amountOut).toString(),
              reserveB: (aIn ? BigInt(pool.reserveB) - amountOut : BigInt(pool.reserveB) + amountIn).toString(),
            },
          ],
          tape: {
            id: ticketId(),
            time: Date.now(),
            poolId: pool.id,
            inMint: body.inMint,
            outMint: body.outMint,
            amountIn: amountIn.toString(),
            amountOut: amountOut.toString(),
            venue: pool.venue === "earth-stable" ? "Earth Stable" : "Earth CPMM",
            live: true,
          },
        };
      } else if (action === "launchTrade") {
        const coin = (state.launches || []).find((c) => c.mint === body.mint);
        if (!coin || coin.graduated) throw new Error("Coin is not on the curve.");
        const side = body.side === "sell" ? "sell" : "buy";
        const amountIn = BigInt(body.amountIn);
        const amountOut = BigInt(body.amountOut);
        if (side === "buy") {
          ixs.push(...(await transferIx(connection, user, vault.publicKey, WSOL, amountIn, false, vault.publicKey, user)));
          ixs.push(...(await transferIx(connection, vault.publicKey, user, coin.mint, amountOut, true, vault.publicKey, user)));
        } else {
          ixs.push(...(await transferIx(connection, user, vault.publicKey, coin.mint, amountIn, false, vault.publicKey, user)));
          ixs.push(...(await transferIx(connection, vault.publicKey, user, WSOL, amountOut, true, vault.publicKey, user)));
        }
        const owner = user.toBase58();
        const held = (state.holdings || []).find((h) => h.mint === coin.mint && h.owner === owner);
        const nextAmt = (held ? BigInt(held.amount) : 0n) + (side === "buy" ? amountOut : -amountIn);
        if (nextAmt < 0n) throw new Error("You do not have that many tokens on this launch.");
        patch = {
          launches: [
            {
              ...coin,
              virtualSol: String(body.virtualSol),
              virtualTokens: String(body.virtualTokens),
              realSolRaised: String(body.realSolRaised),
              tokensSold: String(body.tokensSold),
              graduated: Boolean(body.graduates),
              poolId: body.poolId || coin.poolId,
            },
          ],
          holding: { mint: coin.mint, owner, amount: nextAmt.toString() },
          tape: {
            id: ticketId(),
            time: Date.now(),
            inMint: side === "buy" ? WSOL : coin.mint,
            outMint: side === "buy" ? coin.mint : WSOL,
            amountIn: amountIn.toString(),
            amountOut: amountOut.toString(),
            venue: "Launchpad",
            live: true,
          },
        };
      }

      const encoded = await buildTx(rpcUrl, vault, user, ixs);
      const ticket = ticketId();
      tickets[ticket] = { expires: Date.now() + 90_000, patch };
      await storage.setJSON("tickets", tickets);
      return json(200, { transaction: encoded, ticket, vault: vault.publicKey.toBase58() });
    }

    return json(400, { error: "Unknown settle action." });
  } catch (err) {
    return json(400, { error: err instanceof Error ? err.message : "Settlement failed." });
  }
}

function sqrt(value) {
  if (value <= 0n) return 0n;
  if (value < 4n) return 1n;
  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
}

export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID };
