//! Earth vested-lock factory.
//!
//! Amounts are u128 (Earth adapter 80-byte token account). Unvested tokens
//! cannot leave the account. Unlocked = 0 until cliff, then linear to vest_days.
//! Authority may claw back unvested if `revocable` was set at mint.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::Sysvar,
};

entrypoint!(process_instruction);

pub const DISCRIMINATOR_INIT: u8 = 0;
pub const DISCRIMINATOR_TRANSFER: u8 = 1;
pub const DISCRIMINATOR_MINT_TO: u8 = 2;
pub const DISCRIMINATOR_REVOKE: u8 = 3;

const DAY: i64 = 86_400;

fn u128_at(data: &[u8], offset: usize) -> Result<u128, ProgramError> {
    Ok(u128::from_le_bytes(
        data.get(offset..offset + 16)
            .ok_or(ProgramError::InvalidAccountData)?
            .try_into()
            .unwrap(),
    ))
}

fn write_u128(data: &mut [u8], offset: usize, value: u128) -> ProgramResult {
    data.get_mut(offset..offset + 16)
        .ok_or(ProgramError::InvalidAccountData)?
        .copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn u32_at(data: &[u8], offset: usize) -> Result<u32, ProgramError> {
    Ok(u32::from_le_bytes(
        data.get(offset..offset + 4)
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

/// granted, start_ts, cliff_days, vest_days → currently unlocked
fn unlocked(granted: u128, start_ts: i64, cliff_days: u32, vest_days: u32, now: i64) -> u128 {
    if now < start_ts {
        return 0;
    }
    let elapsed_days = ((now - start_ts) / DAY) as u128;
    let cliff = cliff_days as u128;
    let vest = vest_days.max(1) as u128;
    if elapsed_days < cliff {
        return 0;
    }
    if elapsed_days >= vest {
        return granted;
    }
    granted.saturating_mul(elapsed_days) / vest
}

pub fn process_instruction(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => transfer(accounts, &data[1..]),
        DISCRIMINATOR_MINT_TO => mint_to(accounts, &data[1..]),
        DISCRIMINATOR_REVOKE => revoke(accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// decimals u8, cliff_days u32, vest_days u32, start_delay_days u32, revocable u8
fn init_mint(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 14 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut out = mint.try_borrow_mut_data()?;
    out[0..32].copy_from_slice(mint.key.as_ref());
    out[32..64].copy_from_slice(authority.key.as_ref());
    out[64..80].fill(0); // supply u128
    out[80] = data[0];
    out[81..93].copy_from_slice(&data[1..13]);
    out[93] = data[13];
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
    let amount = u128::from_le_bytes(data[0..16].try_into().unwrap());
    let now = Clock::get()?.unix_timestamp;

    let mint_data = mint.try_borrow_data()?;
    let cliff = u32_at(&mint_data, 81)?;
    let vest = u32_at(&mint_data, 85)?;
    drop(mint_data);

    let src = source.try_borrow_data()?;
    if &src[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    let held = u128_at(&src, 64)?;
    let granted = u128_at(&src, 80).unwrap_or(held);
    let start = i64_at(&src, 96).unwrap_or(0);
    drop(src);
    let free = unlocked(granted, start, cliff, vest, now);
    let locked = granted.saturating_sub(free);
    let spendable = held.saturating_sub(locked);
    if amount > spendable {
        return Err(ProgramError::InsufficientFunds);
    }

    {
        let mut s = source.try_borrow_mut_data()?;
        write_u128(&mut s, 64, held - amount)?;
    }
    {
        let mut d = dest.try_borrow_mut_data()?;
        let dest_amt = u128_at(&d, 64)?;
        write_u128(&mut d, 64, dest_amt.saturating_add(amount))?;
    }
    Ok(())
}

fn mint_to(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let dest = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let amount = u128::from_le_bytes(data.get(0..16).ok_or(ProgramError::InvalidInstructionData)?.try_into().unwrap());
    let now = Clock::get()?.unix_timestamp;
    let mint_data = mint.try_borrow_data()?;
    if &mint_data[32..64] != authority.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    let delay = u32_at(&mint_data, 89).unwrap_or(0) as i64;
    drop(mint_data);
    {
        let mut m = mint.try_borrow_mut_data()?;
        let supply = u128_at(&m, 64)?;
        write_u128(&mut m, 64, supply.saturating_add(amount))?;
    }
    {
        let mut d = dest.try_borrow_mut_data()?;
        let dest_amt = u128_at(&d, 64)?;
        write_u128(&mut d, 64, dest_amt.saturating_add(amount))?;
        if d.len() >= 104 {
            write_u128(&mut d, 80, dest_amt.saturating_add(amount))?;
            d[96..104].copy_from_slice(&(now + delay * DAY).to_le_bytes());
        }
    }
    Ok(())
}

fn revoke(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let source = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mint_data = mint.try_borrow_data()?;
    if &mint_data[32..64] != authority.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    if mint_data.get(93).copied().unwrap_or(0) == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let cliff = u32_at(&mint_data, 81)?;
    let vest = u32_at(&mint_data, 85)?;
    drop(mint_data);
    let now = Clock::get()?.unix_timestamp;
    let mut src = source.try_borrow_mut_data()?;
    let held = u128_at(&src, 64)?;
    let granted = u128_at(&src, 80).unwrap_or(held);
    let start = i64_at(&src, 96).unwrap_or(0);
    let free = unlocked(granted, start, cliff, vest, now);
    let clawback = held.saturating_sub(free);
    write_u128(&mut src, 64, free)?;
    write_u128(&mut src, 80, free)?;
    let mut m = mint.try_borrow_mut_data()?;
    let supply = u128_at(&m, 64)?;
    write_u128(&mut m, 64, supply.saturating_sub(clawback))?;
    Ok(())
}
