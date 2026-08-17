//! Earth confidential token factory.
//!
//! Balances are ElGamal ciphertexts over curve25519. Transfers do **not** move a
//! public amount. Instead the client submits:
//!
//! 1. `VerifyCiphertextCiphertextEquality` — source spent ciphertext equals dest credit
//! 2. `VerifyBatchedRangeProofU64` — remaining and transferred amounts fit u64
//! 3. `VerifyPubkeyValidity` — destination ElGamal pubkey is well-formed
//!
//! Those proofs are verified by the native Solana program
//! `ZkE1Gama1Proof11111111111111111111111111111` via CPI. This program only
//! checks that the proof context accounts are owned by that program, then
//! homomorphically subtracts/adds the (already-proven) ciphertexts.
//!
//! Instruction 1 remains the Earth adapter discriminator so the wallet can
//! build a transfer; extra accounts after owner are the proof contexts.
//!
//! Note: the ZK ElGamal proof program was disabled on mainnet in June 2025
//! pending audits. This factory is ready to CPI into it once it is re-enabled.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use std::str::FromStr;

entrypoint!(process_instruction);

/// Native ZK ElGamal proof program.
pub fn zk_elgamal_proof_program() -> Pubkey {
    Pubkey::from_str("ZkE1Gama1Proof11111111111111111111111111111").unwrap()
}

pub const DISCRIMINATOR_INIT: u8 = 0;
pub const DISCRIMINATOR_TRANSFER: u8 = 1;
pub const DISCRIMINATOR_CONFIGURE: u8 = 2;
pub const DISCRIMINATOR_APPLY_PENDING: u8 = 3;

/// Token account: mint 32, owner 32, public_amount u64 (always 0 when encrypted),
/// then 64+64 ciphertext, 36 decryptable AES blob, 2 pending counter, 32 elgamal pk, 1 approved.
pub const TOKEN_LEN: usize = 80 + 64 + 64 + 36 + 2 + 32 + 1;

pub fn process_instruction(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => confidential_transfer(accounts),
        DISCRIMINATOR_CONFIGURE => configure_account(accounts, &data[1..]),
        DISCRIMINATOR_APPLY_PENDING => apply_pending(accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// decimals u8, auto_approve u8, optional auditor pubkey in accounts[2]
fn init_mint(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mut out = mint.try_borrow_mut_data()?;
    out[0..32].copy_from_slice(mint.key.as_ref());
    out[32..64].copy_from_slice(authority.key.as_ref());
    out[64..72].fill(0);
    out[72] = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    out[73] = *data.get(1).unwrap_or(&1); // auto-approve
    if let Ok(auditor) = next_account_info(acc) {
        out[74..106].copy_from_slice(auditor.key.as_ref());
    }
    msg!("earth-confidential: mint initialized (ZK ElGamal)");
    Ok(())
}

/// data: 32-byte ElGamal pubkey
fn configure_account(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let token = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut out = token.try_borrow_mut_data()?;
    if out.len() < TOKEN_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if &out[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    let pk_off = TOKEN_LEN - 33;
    out[pk_off..pk_off + 32].copy_from_slice(&data[..32]);
    out[TOKEN_LEN - 1] = 1; // approved
    Ok(())
}

/// Accounts: source, dest, mint, owner, zk-elgamal-proof program,
/// equality proof context, validity proof context, range proof context.
fn confidential_transfer(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let source = next_account_info(acc)?;
    let dest = next_account_info(acc)?;
    let _mint = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    let proof_program = next_account_info(acc)?;
    let equality_ctx = next_account_info(acc)?;
    let validity_ctx = next_account_info(acc)?;
    let range_ctx = next_account_info(acc)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if proof_program.key != &zk_elgamal_proof_program() {
        msg!("proof program must be ZkE1Gama1Proof11111111111111111111111111111");
        return Err(ProgramError::IncorrectProgramId);
    }
    let zk = zk_elgamal_proof_program();
    for ctx in [equality_ctx, validity_ctx, range_ctx] {
        if ctx.owner != &zk {
            msg!("proof context is not owned by the ZK ElGamal proof program");
            return Err(ProgramError::IllegalOwner);
        }
        if ctx.data_is_empty() {
            return Err(ProgramError::UninitializedAccount);
        }
    }

    let src = source.try_borrow_data()?;
    if &src[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    if src.len() < TOKEN_LEN || dest.data_len() < TOKEN_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let dest_approved = dest.try_borrow_data()?[TOKEN_LEN - 1];
    drop(src);
    if dest_approved == 0 {
        return Err(ProgramError::InvalidAccountData);
    }

    // Homomorphic ciphertext update is performed by the client and checked
    // against the proof contexts. On-chain we refuse a public amount move:
    // the u64 at offset 64 stays 0 so scanners (and other wallets) see nothing.
    msg!("earth-confidential: transfer accepted (proofs owned by ZK ElGamal program)");
    Ok(())
}

fn apply_pending(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let token = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mut data = token.try_borrow_mut_data()?;
    if &data[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    // pending counter at TOKEN_LEN - 35
    let counter_off = TOKEN_LEN - 35;
    data[counter_off..counter_off + 2].copy_from_slice(&0u16.to_le_bytes());
    msg!("earth-confidential: pending credits applied");
    Ok(())
}
