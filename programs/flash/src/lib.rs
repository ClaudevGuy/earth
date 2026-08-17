//! Earth Flash factory — atomic uncollateralized credit.
//!
//! Ethereum flash-loan providers (Aave-style) lend without collateral if the
//! borrow is repaid in the same transaction plus a premium. Flash is that idea
//! as a token standard. `flash_borrow` (3) credits a vault draw and requires a
//! later `flash_repay` (4) in the same Solana transaction (Instructions
//! sysvar). If repay is missing, borrow fails. Transfers stay a normal Earth
//! adapter path.
//!
//! Token accounts match the Earth adapter spec (mint 32, owner 32, amount u64).
//! Instruction 1 is the Earth adapter transfer (discriminator 1, amount u128 LE).

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    instruction::Instruction,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID},
};

entrypoint!(process_instruction);

pub const DISCRIMINATOR_INIT: u8 = 0;
pub const DISCRIMINATOR_TRANSFER: u8 = 1;
pub const DISCRIMINATOR_MINT_TO: u8 = 2;
pub const DISCRIMINATOR_FLASH_BORROW: u8 = 3;
pub const DISCRIMINATOR_FLASH_REPAY: u8 = 4;

const TOKEN_LEN: usize = 72;
const MINT_LEN: usize = 134;

fn u16_at(data: &[u8], offset: usize) -> Result<u16, ProgramError> {
    Ok(u16::from_le_bytes(
        data.get(offset..offset + 2)
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

fn write_u64(data: &mut [u8], offset: usize, value: u64) -> ProgramResult {
    data.get_mut(offset..offset + 8)
        .ok_or(ProgramError::InvalidAccountData)?
        .copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn take_bps(amount: u64, bps: u16) -> Result<u64, ProgramError> {
    amount
        .checked_mul(bps as u64)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(ProgramError::InvalidArgument)
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

fn require_repay_later(ix_sysvar: &AccountInfo, program_id: &Pubkey) -> ProgramResult {
    if ix_sysvar.key != &INSTRUCTIONS_ID {
        return Err(ProgramError::InvalidAccountData);
    }
    let index = load_current_index_checked(ix_sysvar)? as usize;
    let mut i = index + 1;
    loop {
        let ix: Instruction = match load_instruction_at_checked(i, ix_sysvar) {
            Ok(ix) => ix,
            Err(_) => break,
        };
        if ix.program_id == *program_id && ix.data.first() == Some(&DISCRIMINATOR_FLASH_REPAY) {
            return Ok(());
        }
        i += 1;
    }
    Err(ProgramError::InvalidInstructionData)
}

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => transfer(accounts, &data[1..]),
        DISCRIMINATOR_MINT_TO => mint_to(accounts, &data[1..]),
        DISCRIMINATOR_FLASH_BORROW => flash_borrow(program_id, accounts, &data[1..]),
        DISCRIMINATOR_FLASH_REPAY => flash_repay(accounts, &data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// decimals u8, enabled u8, premium_bps u16, max_flash_bps u16, reserve_bps u16
fn init_mint(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    if mint.data_len() < MINT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let mut out = mint.try_borrow_mut_data()?;
    out[0..32].copy_from_slice(mint.key.as_ref());
    out[32..64].copy_from_slice(authority.key.as_ref());
    out[64..72].fill(0);
    out[72] = data[0];
    out[73] = data[1];
    out[74..80].copy_from_slice(&data[2..8]);
    out[80..134].fill(0);
    msg!("earth-flash: initialized");
    Ok(())
}

fn transfer(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let source = next_account_info(acc)?;
    let dest = next_account_info(acc)?;
    let mint = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 16 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let outstanding = {
        let mint_data = mint.try_borrow_data()?;
        u64_at(&mint_data, 88).unwrap_or(0)
    };
    if outstanding > 0 {
        return Err(ProgramError::InvalidAccountData);
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
    let mint_data = mint.try_borrow_data()?;
    let reserve_bps = u16_at(&mint_data, 78)?;
    let supply = u64_at(&mint_data, 64)?;
    drop(mint_data);
    let seed = if supply == 0 { take_bps(amount, reserve_bps)? } else { 0 };
    let to_dest = amount.checked_sub(seed).ok_or(ProgramError::InvalidArgument)?;
    {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let supply_now = u64_at(&mint_mut, 64)?;
        write_u64(&mut mint_mut, 64, supply_now.saturating_add(amount))?;
        if seed > 0 {
            let vault = u64_at(&mint_mut, 80)?;
            write_u64(&mut mint_mut, 80, vault.saturating_add(seed))?;
        }
    }
    {
        let mut dst = dest.try_borrow_mut_data()?;
        let dest_amt = u64_at(&dst, 64)?;
        write_u64(&mut dst, 64, dest_amt.saturating_add(to_dest))?;
    }
    Ok(())
}

/// Accounts: dest, mint, borrower, instructions sysvar.
fn flash_borrow(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let dest = next_account_info(acc)?;
    let mint = next_account_info(acc)?;
    let borrower = next_account_info(acc)?;
    let ix_sysvar = next_account_info(acc)?;
    if !borrower.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    require_repay_later(ix_sysvar, program_id)?;
    if data.len() < 16 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    {
        let mint_data = mint.try_borrow_data()?;
        if mint_data.get(73).copied().unwrap_or(0) == 0 {
            return Err(ProgramError::InvalidAccountData);
        }
        if u64_at(&mint_data, 88)? != 0 {
            return Err(ProgramError::InvalidAccountData);
        }
        let vault = u64_at(&mint_data, 80)?;
        let max_bps = u16_at(&mint_data, 76)?;
        let cap = if max_bps >= 10_000 {
            vault
        } else {
            take_bps(vault, max_bps)?
        };
        if amount > vault || amount > cap {
            return Err(ProgramError::InsufficientFunds);
        }
    }
    {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let vault = u64_at(&mint_mut, 80)?;
        write_u64(&mut mint_mut, 80, vault - amount)?;
        write_u64(&mut mint_mut, 88, amount)?;
    }
    {
        let mut dst = dest.try_borrow_mut_data()?;
        if dst.len() < TOKEN_LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let dest_amt = u64_at(&dst, 64)?;
        write_u64(&mut dst, 64, dest_amt.saturating_add(amount))?;
    }
    msg!("earth-flash: borrow");
    Ok(())
}

/// Accounts: source, mint, owner. Repays outstanding + premium.
fn flash_repay(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let source = next_account_info(acc)?;
    let mint = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let _ = data;
    let mint_data = mint.try_borrow_data()?;
    let outstanding = u64_at(&mint_data, 88)?;
    let premium_bps = u16_at(&mint_data, 74)?;
    drop(mint_data);
    if outstanding == 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    let premium = take_bps(outstanding, premium_bps)?;
    let due = outstanding.checked_add(premium).ok_or(ProgramError::InvalidArgument)?;
    let src_data = source.try_borrow_data()?;
    if &src_data[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    let src_amt = u64_at(&src_data, 64)?;
    drop(src_data);
    if src_amt < due {
        return Err(ProgramError::InsufficientFunds);
    }
    {
        let mut src = source.try_borrow_mut_data()?;
        write_u64(&mut src, 64, src_amt - due)?;
    }
    {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let vault = u64_at(&mint_mut, 80)?;
        let treasury = u64_at(&mint_mut, 96)?;
        write_u64(&mut mint_mut, 80, vault.saturating_add(outstanding))?;
        write_u64(&mut mint_mut, 96, treasury.saturating_add(premium))?;
        write_u64(&mut mint_mut, 88, 0)?;
    }
    msg!("earth-flash: repay");
    Ok(())
}
