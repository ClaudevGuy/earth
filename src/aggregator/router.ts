import type { ListedToken, Pool, RouteQuote, TokenStandard } from "../types";
import { findPoolsForPair } from "../amm/pools";
import { priceImpactBps, quoteSwap } from "../amm/math";
import { findStandard } from "../adapters/registry";

function venueLabel(venue: Pool["venue"]): string {
  return venue === "earth-stable" ? "Earth Stable" : "Earth CPMM";
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
    const aToB = pool.tokenA === inputMint;
    const reserveIn = BigInt(aToB ? pool.reserveA : pool.reserveB);
    const reserveOut = BigInt(aToB ? pool.reserveB : pool.reserveA);
    const amountOut = quoteSwap(pool.curve, reserveIn, reserveOut, amountIn, pool.feeBps);
    if (amountOut <= 0n) continue;
    quotes.push({
      id: `earth:${pool.id}`,
      venue: venueLabel(pool.venue),
      amountOut: amountOut.toString(),
      priceImpactBps: priceImpactBps(reserveIn, reserveOut, amountIn, amountOut),
      executable: "earth",
      hops: [
        {
          venue: venueLabel(pool.venue),
          poolId: pool.id,
          label: `${venueLabel(pool.venue)} · ${pool.feeBps / 100}%`,
          inMint: inputMint,
          outMint: outputMint,
          amountIn: amountIn.toString(),
          amountOut: amountOut.toString(),
          feeBps: pool.feeBps,
        },
      ],
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

    for (const p1 of firstPools) {
      const aToMid = p1.tokenA === inputMint;
      const rIn1 = BigInt(aToMid ? p1.reserveA : p1.reserveB);
      const rOut1 = BigInt(aToMid ? p1.reserveB : p1.reserveA);
      const midOut = quoteSwap(p1.curve, rIn1, rOut1, amountIn, p1.feeBps);
      if (midOut <= 0n) continue;

      for (const p2 of secondPools) {
        const midToB = p2.tokenA === mid;
        const rIn2 = BigInt(midToB ? p2.reserveA : p2.reserveB);
        const rOut2 = BigInt(midToB ? p2.reserveB : p2.reserveA);
        const finalOut = quoteSwap(p2.curve, rIn2, rOut2, midOut, p2.feeBps);
        if (finalOut <= 0n) continue;
        const midToken = tokens.find((t) => t.mint === mid);
        routes.push({
          id: `earth:${p1.id}>${p2.id}`,
          venue: "Earth hop",
          amountOut: finalOut.toString(),
          priceImpactBps: Math.max(
            priceImpactBps(rIn1, rOut1, amountIn, midOut),
            priceImpactBps(rIn2, rOut2, midOut, finalOut),
          ),
          executable: "earth",
          hops: [
            {
              venue: venueLabel(p1.venue),
              poolId: p1.id,
              label: `${midToken?.symbol ?? "mid"} hop`,
              inMint: inputMint,
              outMint: mid,
              amountIn: amountIn.toString(),
              amountOut: midOut.toString(),
              feeBps: p1.feeBps,
            },
            {
              venue: venueLabel(p2.venue),
              poolId: p2.id,
              label: venueLabel(p2.venue),
              inMint: mid,
              outMint: outputMint,
              amountIn: midOut.toString(),
              amountOut: finalOut.toString(),
              feeBps: p2.feeBps,
            },
          ],
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
