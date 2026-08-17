//! Earth Proxy factory — upgradeable token contracts.
//!
//! Ethereum proxy patterns (transparent / UUPS, EIP-1967) keep one address
//! while swapping the implementation. Proxy is that idea as a token standard:
//! holders keep this contract address; the admin proposes a new implementation
//! pubkey, a delay elapses, then anyone can commit. Freeze locks the slot
//! forever (renounce analog). Transfers always run through this program so the
//! Earth adapter layout never moves.
//!
//! Token accounts match the Earth adapter spec (mint 32, owner 32, amount u64).
//! Instruction 1 is the Earth adapter transfer (discriminator 1, amount u128 LE).

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::Sysvar,
};

entrypoint!(process_instruction);

pub const DISCRIMINATOR_INIT: u8 = 0;
pub const DISCRIMINATOR_TRANSFER: u8 = 1;
pub const DISCRIMINATOR_MINT_TO: u8 = 2;
pub const DISCRIMINATOR_PROPOSE: u8 = 3;
pub const DISCRIMINATOR_COMMIT: u8 = 4;
pub const DISCRIMINATOR_FREEZE: u8 = 5;

const TOKEN_LEN: usize = 72;
const MINT_LEN: usize = 150;

fn u32_at(data: &[u8], offset: usize) -> Result<u32, ProgramError> {
    Ok(u32::from_le_bytes(
        data.get(offset..offset + 4)
            .ok_or(ProgramError::InvalidAccountData)?
            .try_into()
            .unwrap(),
    ))
}

fn u64_at(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(
        data.get(offset..offset + 8)
            .ok_or(ProgramError::InvalidAccountData)?
            .try_into()
            .unwrap(),
    ))
}

fn i64_at(data: &[u8], offset: usize) -> Result<i64, ProgramError> {
    Ok(i64::from_le_bytes(
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

fn write_i64(data: &mut [u8], offset: usize, value: i64) -> ProgramResult {
    data.get_mut(offset..offset + 8)
        .ok_or(ProgramError::InvalidAccountData)?
        .copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn require_admin(mint: &AccountInfo, admin: &AccountInfo) -> ProgramResult {
    if !admin.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let data = mint.try_borrow_data()?;
    if &data[32..64] != admin.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    if data.get(73).copied().unwrap_or(0) != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

pub fn process_instruction(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => transfer(accounts, &data[1..]),
        DISCRIMINATOR_MINT_TO => mint_to(accounts, &data[1..]),
        DISCRIMINATOR_PROPOSE => propose(accounts),
        DISCRIMINATOR_COMMIT => commit(accounts),
        DISCRIMINATOR_FREEZE => freeze(accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// decimals u8, delay_secs u32, frozen u8
fn init_mint(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let admin = next_account_info(acc)?;
    let implementation = next_account_info(acc)?;
    if !admin.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 6 {
        return Err(ProgramError::InvalidInstructionData);
    }
    if mint.data_len() < MINT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let mut out = mint.try_borrow_mut_data()?;
    out[0..32].copy_from_slice(mint.key.as_ref());
    out[32..64].copy_from_slice(admin.key.as_ref());
    out[64..72].fill(0);
    out[72] = data[0];
    out[73] = if data[5] == 0 { 0 } else { 1 };
    out[74..106].copy_from_slice(implementation.key.as_ref());
    out[106..138].fill(0);
    out[138..146].fill(0);
    out[146..150].copy_from_slice(&data[1..5]);
    msg!("earth-proxy: initialized");
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
    let admin = next_account_info(acc)?;
    if !admin.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mint_data = mint.try_borrow_data()?;
    if &mint_data[32..64] != admin.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    drop(mint_data);
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

/// Admin sets a pending implementation. Commit after `delay_secs`.
fn propose(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let admin = next_account_info(acc)?;
    let implementation = next_account_info(acc)?;
    require_admin(mint, admin)?;
    let now = Clock::get()?.unix_timestamp;
    let mut out = mint.try_borrow_mut_data()?;
    out[106..138].copy_from_slice(implementation.key.as_ref());
    write_i64(&mut out, 138, now)?;
    msg!("earth-proxy: upgrade proposed");
    Ok(())
}

fn commit(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let now = Clock::get()?.unix_timestamp;
    let mut out = mint.try_borrow_mut_data()?;
    if out.get(73).copied().unwrap_or(0) != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    if out[106..138] == [0u8; 32] {
        return Err(ProgramError::InvalidAccountData);
    }
    let pending_at = i64_at(&out, 138)?;
    let delay = u32_at(&out, 146)? as i64;
    if now < pending_at.saturating_add(delay) {
        return Err(ProgramError::InvalidArgument);
    }
    let pending = out[106..138].to_vec();
    out[74..106].copy_from_slice(&pending);
    out[106..138].fill(0);
    write_i64(&mut out, 138, 0)?;
    msg!("earth-proxy: upgrade committed");
    Ok(())
}

fn freeze(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let admin = next_account_info(acc)?;
    require_admin(mint, admin)?;
    let mut out = mint.try_borrow_mut_data()?;
    out[73] = 1;
    out[106..138].fill(0);
    write_i64(&mut out, 138, 0)?;
    msg!("earth-proxy: upgrades frozen");
    Ok(())
}
