export type AmountWidth = "u64" | "u128";

export type StandardKind = "spl-token" | "token-2022" | "custom";

export type ReviewStatus = "native" | "registered" | "unverified";

export type StandardSource = "native" | "seeded" | "created" | "catalog";

/** Earth-built factory programs. Users mint on these by filling variables only. */
export type FactoryKind = "memecoin" | "reflect" | "confidential" | "vesting" | "launch";

export interface TokenStandard {
  id: string;
  name: string;
  kind: StandardKind;
  programId: string;
  amountWidth: AmountWidth;
  review: ReviewStatus;
  notes: string;
  userCreated?: boolean;
  source?: StandardSource;
  published?: boolean;
  publisher?: string;
  createdAt?: number;
  factory?: FactoryKind;
}

/** Public catalog record — what other users can find and mint against. */
export interface CatalogStandard {
  id: string;
  name: string;
  kind: StandardKind;
  programId: string;
  amountWidth: AmountWidth;
  notes: string;
  publisher?: string;
  publishedAt: number;
  factory?: FactoryKind;
}

/** Mint-time variables for an Earth factory standard. */
export type TokenMintConfig = Record<string, string | number | boolean>;

export interface ListedToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  standardId: string;
  tags?: string[];
  config?: TokenMintConfig;
}

export type CurveKind = "constant-product" | "stable";

export interface Pool {
  id: string;
  tokenA: string;
  tokenB: string;
  reserveA: string;
  reserveB: string;
  lpSupply: string;
  feeBps: number;
  curve: CurveKind;
  venue: "earth-cpmm" | "earth-stable";
}

export interface LpPosition {
  poolId: string;
  shares: string;
}

export interface QuoteHop {
  venue: string;
  poolId?: string;
  label: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  amountOut: string;
  feeBps: number;
  /** Amount the pool actually receives when the input token levies a tax. */
  poolAmountIn?: string;
  /** Amount the pool actually sends when the output token levies a tax. */
  poolAmountOut?: string;
}

export interface RouteQuote {
  id: string;
  venue: string;
  amountOut: string;
  priceImpactBps: number;
  hops: QuoteHop[];
  executable: "earth" | "jupiter" | "none";
  note?: string;
}

export type Page = "trade" | "swap" | "pools" | "liquidity" | "standards" | "docs";

export interface PairFocus {
  mintA?: string;
  mintB?: string;
}
