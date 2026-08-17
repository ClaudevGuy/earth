export const WSOL = "So11111111111111111111111111111111111111112";
export const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/** Native Solana program that verifies ElGamal / Pedersen ZK proofs. */
export const ZK_ELGAMAL_PROOF_PROGRAM = "ZkE1Gama1Proof11111111111111111111111111111";

/**
 * $EARTH mint. Leave empty until the token is live, then paste the address here.
 * `VITE_EARTH_MINT` overrides this when set.
 */
const EARTH_MINT_ADDRESS = "";
export const EARTH_MINT = (import.meta.env.VITE_EARTH_MINT ?? EARTH_MINT_ADDRESS).trim();
/** Used to quote the listing burn until mint metadata is known. */
export const EARTH_DECIMALS = 9;
/** USD value of $EARTH burned to list a custom token standard. Tokens are burned, not paid to Earth. */
export const STANDARD_CREATE_FEE_USD = 1000;
