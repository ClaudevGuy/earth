//! Earth reflect / burn factory.
//!
//! Every transfer splits `reflection_bps + burn_bps + treasury_bps` off the
//! amount. Reflection is credited to a holder-index account (pro-rata magnified
//! balance). Instruction 1 is the Earth adapter transfer.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub const DISCRIMINATOR_INIT: u8 = 0;
pub const DISCRIMINATOR_TRANSFER: u8 = 1;
pub const DISCRIMINATOR_MINT_TO: u8 = 2;

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

pub fn process_instruction(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => transfer(accounts, &data[1..]),
        DISCRIMINATOR_MINT_TO => mint_to(accounts, &data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// decimals u8, reflection u16, burn u16, treasury u16
fn init_mint(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    let treasury = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 7 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut out = mint.try_borrow_mut_data()?;
    out[0..32].copy_from_slice(mint.key.as_ref());
    out[32..64].copy_from_slice(authority.key.as_ref());
    out[64..72].copy_from_slice(&0u64.to_le_bytes());
    out[72] = data[0];
    out[73..79].copy_from_slice(&data[1..7]);
    out[79..111].copy_from_slice(treasury.key.as_ref());
    Ok(())
}

fn transfer(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let source = next_account_info(acc)?;
    let dest = next_account_info(acc)?;
    let mint = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    let treasury_acc = next_account_info(acc).ok();
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 16 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());

    let mint_data = mint.try_borrow_data()?;
    let reflection = take_bps(amount, u16_at(&mint_data, 73)?)?;
    let burned = take_bps(amount, u16_at(&mint_data, 75)?)?;
    let treasury = take_bps(amount, u16_at(&mint_data, 77)?)?;
    drop(mint_data);
    let credited = amount
        .checked_sub(reflection + burned + treasury)
        .ok_or(ProgramError::InvalidArgument)?;

    {
        let mut src = source.try_borrow_mut_data()?;
        if &src[32..64] != owner.key.as_ref() {
            return Err(ProgramError::IllegalOwner);
        }
        let src_amt = u64_at(&src, 64)?;
        if src_amt < amount {
            return Err(ProgramError::InsufficientFunds);
        }
        write_u64(&mut src, 64, src_amt - amount)?;
    }
    {
        let mut dst = dest.try_borrow_mut_data()?;
        let dest_amt = u64_at(&dst, 64)?;
        write_u64(&mut dst, 64, dest_amt.saturating_add(credited))?;
    }
    if burned > 0 {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let supply = u64_at(&mint_mut, 64)?;
        write_u64(&mut mint_mut, 64, supply.saturating_sub(burned))?;
    }
    if treasury > 0 {
        if let Some(t) = treasury_acc {
            let mut td = t.try_borrow_mut_data()?;
            let t_amt = u64_at(&td, 64)?;
            write_u64(&mut td, 64, t_amt.saturating_add(treasury))?;
        }
    }
    // reflection accrues via magnified-balance index stored after amount on the mint
    if reflection > 0 {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        if mint_mut.len() >= 119 {
            let mag = u64_at(&mint_mut, 111).unwrap_or(0);
            write_u64(&mut mint_mut, 111, mag.saturating_add(reflection))?;
        }
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
    let amount = u64::from_le_bytes(data.get(0..8).ok_or(ProgramError::InvalidInstructionData)?.try_into().unwrap());
    let mint_data = mint.try_borrow_data()?;
    if &mint_data[32..64] != authority.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    drop(mint_data);
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
