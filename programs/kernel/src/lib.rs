//! Earth Kernel factory — precompile-style system contracts.
//!
//! Ethereum keeps privileged operations at fixed precompile addresses
//! (ecrecover, SHA-256, identity, …). Kernel is that idea as a token
//! standard: the contract sits at a reserved slot, transfers are a normal
//! Earth adapter, and extra instructions are syscalls (hash, recover,
//! identity). Each syscall can charge a flat token fee into the kernel
//! treasury.
//!
//! Token accounts match the Earth adapter spec (mint 32, owner 32, amount u64).
//! Instruction 1 is the Earth adapter transfer (discriminator 1, amount u128 LE).

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    hash::hash,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub const DISCRIMINATOR_INIT: u8 = 0;
pub const DISCRIMINATOR_TRANSFER: u8 = 1;
pub const DISCRIMINATOR_MINT_TO: u8 = 2;
pub const DISCRIMINATOR_SYSCALL_HASH: u8 = 3;
pub const DISCRIMINATOR_SYSCALL_RECOVER: u8 = 4;
pub const DISCRIMINATOR_SYSCALL_IDENTITY: u8 = 5;

pub const FLAG_HASH: u8 = 1;
pub const FLAG_RECOVER: u8 = 2;
pub const FLAG_IDENTITY: u8 = 4;

const TOKEN_LEN: usize = 72;
const MINT_LEN: usize = 131;

fn u64_at(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(
        data.get(offset..offset + 8)
            .ok_or(ProgramError::InvalidAccountData)?
            .try_into()
            .unwrap(),
    ))
}

fn write_u64(data: &mut [u8], offset: usize, value: u64) -> ProgramResult {
    data.get_mut(offset..offset + 8)
        .ok_or(ProgramError::InvalidAccountData)?
        .copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn require_authority(mint: &AccountInfo, authority: &AccountInfo) -> ProgramResult {
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let data = mint.try_borrow_data()?;
    if &data[32..64] != authority.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    Ok(())
}

pub fn process_instruction(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => transfer(accounts, &data[1..]),
        DISCRIMINATOR_MINT_TO => mint_to(accounts, &data[1..]),
        DISCRIMINATOR_SYSCALL_HASH => syscall(accounts, &data[1..], FLAG_HASH, SyscallKind::Hash),
        DISCRIMINATOR_SYSCALL_RECOVER => syscall(accounts, &data[1..], FLAG_RECOVER, SyscallKind::Recover),
        DISCRIMINATOR_SYSCALL_IDENTITY => syscall(accounts, &data[1..], FLAG_IDENTITY, SyscallKind::Identity),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// decimals u8, kernel_slot u8, flags u8, syscall_fee u64
fn init_mint(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 11 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let slot = data[1];
    if slot < 1 || slot > 16 {
        return Err(ProgramError::InvalidArgument);
    }
    if mint.data_len() < MINT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let mut out = mint.try_borrow_mut_data()?;
    out[0..32].copy_from_slice(mint.key.as_ref());
    out[32..64].copy_from_slice(authority.key.as_ref());
    out[64..72].fill(0);
    out[72] = data[0];
    out[73] = slot;
    out[74..82].copy_from_slice(&data[3..11]);
    out[82] = data[2];
    out[83..131].fill(0);
    msg!("earth-kernel: slot {} initialized", slot);
    Ok(())
}

fn transfer(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let source = next_account_info(acc)?;
    let dest = next_account_info(acc)?;
    let _mint = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 16 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let src_data = source.try_borrow_data()?;
    if &src_data[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    let src_amt = u64_at(&src_data, 64)?;
    drop(src_data);
    if src_amt < amount {
        return Err(ProgramError::InsufficientFunds);
    }
    {
        let mut src = source.try_borrow_mut_data()?;
        write_u64(&mut src, 64, src_amt - amount)?;
    }
    {
        let mut dst = dest.try_borrow_mut_data()?;
        if dst.len() < TOKEN_LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let dest_amt = u64_at(&dst, 64)?;
        write_u64(&mut dst, 64, dest_amt.saturating_add(amount))?;
    }
    Ok(())
}

fn mint_to(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let dest = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    require_authority(mint, authority)?;
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
    {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let supply = u64_at(&mint_mut, 64)?;
        write_u64(&mut mint_mut, 64, supply.saturating_add(amount))?;
    }
    {
        let mut dst = dest.try_borrow_mut_data()?;
        let dest_amt = u64_at(&dst, 64)?;
        write_u64(&mut dst, 64, dest_amt.saturating_add(amount))?;
    }
    Ok(())
}

enum SyscallKind {
    Hash,
    Recover,
    Identity,
}

/// Accounts: source, mint, owner [, identity signer for recover].
/// Payload is hashed, recovered as a signer pubkey, or copied (identity).
fn syscall(accounts: &[AccountInfo], payload: &[u8], flag: u8, kind: SyscallKind) -> ProgramResult {
    let acc = &mut accounts.iter();
    let source = next_account_info(acc)?;
    let mint = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mint_data = mint.try_borrow_data()?;
    if mint_data.len() < MINT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if mint_data[82] & flag == 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    let fee = u64_at(&mint_data, 74)?;
    drop(mint_data);

    let src_data = source.try_borrow_data()?;
    if &src_data[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    let src_amt = u64_at(&src_data, 64)?;
    drop(src_data);
    if src_amt < fee {
        return Err(ProgramError::InsufficientFunds);
    }

    let result = match kind {
        SyscallKind::Hash => hash(payload).to_bytes(),
        SyscallKind::Recover => {
            let identity = next_account_info(acc)?;
            if !identity.is_signer {
                return Err(ProgramError::MissingRequiredSignature);
            }
            identity.key.to_bytes()
        }
        SyscallKind::Identity => {
            let mut out = [0u8; 32];
            let n = payload.len().min(32);
            out[..n].copy_from_slice(&payload[..n]);
            out
        }
    };

    if fee > 0 {
        let mut src = source.try_borrow_mut_data()?;
        write_u64(&mut src, 64, src_amt - fee)?;
    }
    {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        if fee > 0 {
            let treasury = u64_at(&mint_mut, 83)?;
            write_u64(&mut mint_mut, 83, treasury.saturating_add(fee))?;
        }
        let count = u64_at(&mint_mut, 91)?;
        write_u64(&mut mint_mut, 91, count.saturating_add(1))?;
        mint_mut[99..131].copy_from_slice(&result);
    }
    msg!("earth-kernel: syscall");
    Ok(())
}
