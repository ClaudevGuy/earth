import type { ListedToken, Pool, QuoteHop, RouteQuote, TokenStandard } from "../types";
import { findPoolsForPair } from "../amm/pools";
import { priceImpactBps, quoteSwap } from "../amm/math";
import { findStandard } from "../adapters/registry";
import { applyTransferLevy, levyNote } from "../standards/transfer";

function venueLabel(venue: Pool["venue"]): string {
  return venue === "earth-stable" ? "Earth Stable" : "Earth CPMM";
}

function quoteHop(
  pool: Pool,
  tokens: ListedToken[],
  inputMint: string,
  outputMint: string,
  amountIn: bigint,
  label: string,
): QuoteHop | null {
  const aToB = pool.tokenA === inputMint;
  const reserveIn = BigInt(aToB ? pool.reserveA : pool.reserveB);
  const reserveOut = BigInt(aToB ? pool.reserveB : pool.reserveA);
  const inToken = tokens.find((t) => t.mint === inputMint);
  const outToken = tokens.find((t) => t.mint === outputMint);
  const inLevy = applyTransferLevy(inToken, amountIn, "sell");
  const poolIn = inLevy.toRecipient;
  if (poolIn <= 0n) return null;
  const poolOut = quoteSwap(pool.curve, reserveIn, reserveOut, poolIn, pool.feeBps);
  if (poolOut <= 0n) return null;
  const outLevy = applyTransferLevy(outToken, poolOut, "buy");
  if (outLevy.toRecipient <= 0n) return null;
  const notes = [levyNote(inToken, "sell"), levyNote(outToken, "buy")].filter(Boolean);
  return {
    venue: venueLabel(pool.venue),
    poolId: pool.id,
    label: notes.length ? `${label} · ${notes.join(" · ")}` : label,
    inMint: inputMint,
    outMint: outputMint,
    amountIn: amountIn.toString(),
    amountOut: outLevy.toRecipient.toString(),
    feeBps: pool.feeBps,
    poolAmountIn: poolIn.toString(),
    poolAmountOut: poolOut.toString(),
  };
}

export function quoteEarthRoutes(
  pools: Pool[],
  tokens: ListedToken[],
  inputMint: string,
  outputMint: string,
  amountIn: bigint,
): RouteQuote[] {
  if (amountIn <= 0n || inputMint === outputMint) return [];
  const matched = findPoolsForPair(pools, inputMint, outputMint);
  const quotes: RouteQuote[] = [];

  for (const pool of matched) {
    const hop = quoteHop(
      pool,
      tokens,
      inputMint,
      outputMint,
      amountIn,
      `${venueLabel(pool.venue)} · ${pool.feeBps / 100}%`,
    );
    if (!hop) continue;
    const aToB = pool.tokenA === inputMint;
    const reserveIn = BigInt(aToB ? pool.reserveA : pool.reserveB);
    const reserveOut = BigInt(aToB ? pool.reserveB : pool.reserveA);
    quotes.push({
      id: `earth:${pool.id}`,
      venue: venueLabel(pool.venue),
      amountOut: hop.amountOut,
      priceImpactBps: priceImpactBps(reserveIn, reserveOut, BigInt(hop.poolAmountIn ?? hop.amountIn), BigInt(hop.poolAmountOut ?? hop.amountOut)),
      executable: "earth",
      hops: [hop],
      note: hop.label.includes("tax") || hop.label.includes("levy") ? hop.label : undefined,
    });
  }

  const hopRoutes = quoteTwoHop(pools, tokens, inputMint, outputMint, amountIn);
  quotes.push(...hopRoutes);
  quotes.sort((a, b) => (BigInt(a.amountOut) < BigInt(b.amountOut) ? 1 : -1));
  return quotes;
}

function quoteTwoHop(
  pools: Pool[],
  tokens: ListedToken[],
  inputMint: string,
  outputMint: string,
  amountIn: bigint,
): RouteQuote[] {
  const mints = new Set(tokens.map((t) => t.mint));
  const routes: RouteQuote[] = [];

  for (const mid of mints) {
    if (mid === inputMint || mid === outputMint) continue;
    const firstPools = findPoolsForPair(pools, inputMint, mid);
    const secondPools = findPoolsForPair(pools, mid, outputMint);
    if (!firstPools.length || !secondPools.length) continue;

    const midToken = tokens.find((t) => t.mint === mid);
    for (const p1 of firstPools) {
      const hop1 = quoteHop(p1, tokens, inputMint, mid, amountIn, `${midToken?.symbol ?? "mid"} hop`);
      if (!hop1) continue;

      for (const p2 of secondPools) {
        const hop2 = quoteHop(p2, tokens, mid, outputMint, BigInt(hop1.amountOut), venueLabel(p2.venue));
        if (!hop2) continue;
        const aToMid = p1.tokenA === inputMint;
        const rIn1 = BigInt(aToMid ? p1.reserveA : p1.reserveB);
        const rOut1 = BigInt(aToMid ? p1.reserveB : p1.reserveA);
        const midToB = p2.tokenA === mid;
        const rIn2 = BigInt(midToB ? p2.reserveA : p2.reserveB);
        const rOut2 = BigInt(midToB ? p2.reserveB : p2.reserveA);
        routes.push({
          id: `earth:${p1.id}>${p2.id}`,
          venue: "Earth hop",
          amountOut: hop2.amountOut,
          priceImpactBps: Math.max(
            priceImpactBps(rIn1, rOut1, BigInt(hop1.poolAmountIn ?? hop1.amountIn), BigInt(hop1.poolAmountOut ?? hop1.amountOut)),
            priceImpactBps(rIn2, rOut2, BigInt(hop2.poolAmountIn ?? hop2.amountIn), BigInt(hop2.poolAmountOut ?? hop2.amountOut)),
          ),
          executable: "earth",
          hops: [hop1, hop2],
        });
      }
    }
  }

  return routes.slice(0, 4);
}

export function canUseJupiter(input: ListedToken, output: ListedToken, standards: TokenStandard[]): boolean {
  const a = findStandard(input.standardId, standards);
  const b = findStandard(output.standardId, standards);
  return Boolean(a && b && a.kind !== "custom" && b.kind !== "custom");
}

export async function quoteJupiter(
  inputMint: string,
  outputMint: string,
  amountIn: bigint,
): Promise<RouteQuote | null> {
  if (amountIn <= 0n) return null;
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountIn.toString(),
    });
    const res = await fetch(`/api/jupiter-quote?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      outAmount?: string;
      priceImpactPct?: number;
      skipped?: boolean;
    };
    if (data.skipped || !data.outAmount) return null;
    const impact = Math.round(Math.abs(data.priceImpactPct ?? 0) * 100);
    return {
      id: "jupiter",
      venue: "Jupiter",
      amountOut: data.outAmount,
      priceImpactBps: impact,
      executable: "jupiter",
      note: "SPL / Token-2022 only. Requires JUPITER_API_KEY on Netlify.",
      hops: [
        {
          venue: "Jupiter",
          label: "Jupiter meta-aggregator",
          inMint: inputMint,
          outMint: outputMint,
          amountIn: amountIn.toString(),
          amountOut: data.outAmount,
          feeBps: 0,
        },
      ],
    };
  } catch {
    return null;
  }
}

export function pickBest(routes: RouteQuote[]): RouteQuote | undefined {
  return routes[0];
}
