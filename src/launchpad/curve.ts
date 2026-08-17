import { parseAmount } from "../lib/amounts";

/** Shared launchpad curve. Same for every coin so the board is comparable. */
export const LAUNCH_DEFAULTS = {
  totalSupply: "1000000000",
  tokensOnCurve: "800000000",
  virtualSol: "30",
  graduationSol: "85",
  feeBps: 100,
  decimals: 6,
} as const;

export interface CurveState {
  virtualSol: bigint;
  virtualTokens: bigint;
  realSolRaised: bigint;
  tokensSold: bigint;
  graduationSol: bigint;
  feeBps: number;
}

export interface CurveQuote {
  amountIn: bigint;
  amountOut: bigint;
  fee: bigint;
  virtualSol: bigint;
  virtualTokens: bigint;
  realSolRaised: bigint;
  tokensSold: bigint;
  graduates: boolean;
}

function takeBps(amount: bigint, bps: number): bigint {
  if (bps <= 0) return 0n;
  return (amount * BigInt(bps)) / 10_000n;
}

function kOf(sol: bigint, tokens: bigint): bigint {
  return sol * tokens;
}

export function initialCurve(decimals: number, feeBps = LAUNCH_DEFAULTS.feeBps): CurveState {
  return {
    virtualSol: parseAmount(LAUNCH_DEFAULTS.virtualSol, 9),
    virtualTokens: parseAmount(LAUNCH_DEFAULTS.tokensOnCurve, decimals),
    realSolRaised: 0n,
    tokensSold: 0n,
    graduationSol: parseAmount(LAUNCH_DEFAULTS.graduationSol, 9),
    feeBps,
  };
}

export function lpTokenReserve(decimals: number): bigint {
  const total = parseAmount(LAUNCH_DEFAULTS.totalSupply, decimals);
  const onCurve = parseAmount(LAUNCH_DEFAULTS.tokensOnCurve, decimals);
  return total - onCurve;
}

export function quoteBuy(state: CurveState, solIn: bigint): CurveQuote {
  if (solIn <= 0n) throw new Error("Enter a SOL amount greater than 0.");
  const remaining = state.graduationSol - state.realSolRaised;
  if (remaining <= 0n) throw new Error("This coin has already graduated.");

  const denom = 10_000n - BigInt(state.feeBps);
  if (denom <= 0n) throw new Error("Invalid curve fee.");
  const maxGross = (remaining * 10_000n + denom - 1n) / denom;
  const usedIn = solIn < maxGross ? solIn : maxGross;
  const fee = takeBps(usedIn, state.feeBps);
  const net = usedIn - fee;
  if (net <= 0n) throw new Error("Amount is too small after the launch fee.");

  const k = kOf(state.virtualSol, state.virtualTokens);
  const virtualSol = state.virtualSol + net;
  const virtualTokens = k / virtualSol;
  if (virtualTokens <= 0n || virtualTokens >= state.virtualTokens) {
    throw new Error("This size does not move the curve.");
  }
  const tokensOut = state.virtualTokens - virtualTokens;
  const realSolRaised = state.realSolRaised + net;
  return {
    amountIn: usedIn,
    amountOut: tokensOut,
    fee,
    virtualSol,
    virtualTokens,
    realSolRaised,
    tokensSold: state.tokensSold + tokensOut,
    graduates: realSolRaised >= state.graduationSol,
  };
}

export function quoteSell(state: CurveState, tokensIn: bigint): CurveQuote {
  if (tokensIn <= 0n) throw new Error("Enter a token amount greater than 0.");
  if (tokensIn > state.tokensSold) throw new Error("Not enough tokens have been bought on this curve.");

  const k = kOf(state.virtualSol, state.virtualTokens);
  const virtualTokens = state.virtualTokens + tokensIn;
  const virtualSol = k / virtualTokens;
  if (virtualSol <= 0n || virtualSol >= state.virtualSol) {
    throw new Error("This size does not move the curve.");
  }
  const grossSol = state.virtualSol - virtualSol;
  const floor = state.virtualSol - state.realSolRaised;
  if (virtualSol < floor) throw new Error("That sell would drain virtual SOL. Try a smaller size.");
  const fee = takeBps(grossSol, state.feeBps);
  const net = grossSol - fee;
  if (net <= 0n) throw new Error("Amount is too small after the launch fee.");
  const realSolRaised = state.realSolRaised - grossSol;
  if (realSolRaised < 0n) throw new Error("That sell is larger than SOL still on the curve.");
  return {
    amountIn: tokensIn,
    amountOut: net,
    fee,
    virtualSol,
    virtualTokens,
    realSolRaised,
    tokensSold: state.tokensSold - tokensIn,
    graduates: false,
  };
}

export function spotSolPerToken(virtualSol: bigint, virtualTokens: bigint, tokenDecimals: number): number {
  if (virtualTokens <= 0n) return 0;
  const sol = Number(virtualSol) / 1e9;
  const tokens = Number(virtualTokens) / 10 ** tokenDecimals;
  if (!Number.isFinite(sol) || !Number.isFinite(tokens) || tokens <= 0) return 0;
  return sol / tokens;
}

export function progressBps(raised: bigint, target: bigint): number {
  if (target <= 0n) return 0;
  const bps = Number((raised * 10_000n) / target);
  return Math.max(0, Math.min(10_000, bps));
}
