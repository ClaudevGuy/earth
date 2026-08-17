export type AmountWidth = "u64" | "u128";

export type StandardKind = "spl-token" | "token-2022" | "custom";

export type ReviewStatus = "native" | "registered" | "unverified";

export type StandardSource = "native" | "seeded" | "created" | "catalog";

/** Public token-program source. Required for custom standards; shown on the card and in the catalog. */
export interface StandardSourceCode {
  filename: string;
  code: string;
}

/** Earth-built factory programs. Users create a contract on these by filling variables only. */
export type FactoryKind =
  | "memecoin"
  | "reflect"
  | "confidential"
  | "vesting"
  | "agent"
  | "kernel"
  | "proxy"
  | "flash"
  | "chamber"
  | "launch";

export interface TokenSocials {
  website?: string;
  twitter?: string;
  telegram?: string;
}

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
  sourceCode?: StandardSourceCode;
}

/** Public catalog record — what other users can find and create a contract against. */
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
  sourceCode?: StandardSourceCode;
}

/** Mint-time variables for an Earth factory standard. */
export type TokenMintConfig = Record<string, string | number | boolean>;

/** One-way listing locks. All three true → the token is marked Safe on DEX. */
export interface TokenLock {
  mintRevoked: boolean;
  freezeRevoked: boolean;
  metadataImmutable: boolean;
}

export type LockKind = keyof TokenLock;

export interface ListedToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  standardId: string;
  tags?: string[];
  config?: TokenMintConfig;
  lock?: TokenLock;
  logo?: string;
  description?: string;
  socials?: TokenSocials;
}

/** A coin on the Earth launchpad bonding curve. Graduates into an Earth CPMM pool. */
export interface LaunchpadCoin {
  id: string;
  mint: string;
  standardId: string;
  creator?: string;
  createdAt: number;
  virtualSol: string;
  virtualTokens: string;
  realSolRaised: string;
  tokensSold: string;
  graduationSol: string;
  lpTokenReserve: string;
  feeBps: number;
  graduated: boolean;
  poolId?: string;
  vault?: string;
}

export interface LaunchpadHolding {
  mint: string;
  owner: string;
  amount: string;
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
  vault?: string;
  creator?: string;
  locked?: boolean;
}

export interface LpPosition {
  poolId: string;
  shares: string;
  owner?: string;
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
  executable: "earth" | "none";
  note?: string;
}

export type Page = "home" | "dex" | "trade" | "pools" | "liquidity" | "launchpad" | "standards" | "docs";

export interface PairFocus {
  mintA?: string;
  mintB?: string;
}
