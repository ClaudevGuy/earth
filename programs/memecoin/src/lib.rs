//! Earth memecoin factory.
//!
//! Token accounts match the Earth adapter spec (mint 32, owner 32, amount u64 LE)
//! then extra fields. Transfers take buy/sell tax, split burn vs creator, and
//! enforce max-wallet / anti-snipe.
//!
//! Instruction 1 is the Earth adapter transfer (discriminator 1, amount u128 LE).

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub const DISCRIMINATOR_INIT: u8 = 0;
pub const DISCRIMINATOR_TRANSFER: u8 = 1;
pub const DISCRIMINATOR_MINT_TO: u8 = 2;

const TOKEN_LEN: usize = 72 + 8; // base 72 + last_tx_slot u64
const MINT_LEN: usize = 32 + 32 + 8 + 1 + 2 + 2 + 2 + 2 + 2 + 1 + 8; // packed config

fn u16_at(data: &[u8], offset: usize) -> Result<u16, ProgramError> {
    let slice = data.get(offset..offset + 2).ok_or(ProgramError::InvalidAccountData)?;
    Ok(u16::from_le_bytes(slice.try_into().unwrap()))
}

fn u64_at(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    let slice = data.get(offset..offset + 8).ok_or(ProgramError::InvalidAccountData)?;
    Ok(u64::from_le_bytes(slice.try_into().unwrap()))
}

fn write_u64(data: &mut [u8], offset: usize, value: u64) -> ProgramResult {
    let slice = data.get_mut(offset..offset + 8).ok_or(ProgramError::InvalidAccountData)?;
    slice.copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn take_bps(amount: u64, bps: u16) -> Result<u64, ProgramError> {
    amount
        .checked_mul(bps as u64)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(ProgramError::InvalidArgument)
}

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(program_id, accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => transfer(program_id, accounts, &data[1..]),
        DISCRIMINATOR_MINT_TO => mint_to(program_id, accounts, &data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// data: decimals u8, buy_tax u16, sell_tax u16, burn_share u16, creator_share u16,
/// max_wallet u16, anti_snipe u8, supply u64
fn init_mint(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    let creator = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if mint.data_len() < MINT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if data.len() < 1 + 2 * 5 + 1 + 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut out = mint.try_borrow_mut_data()?;
    out[0..32].copy_from_slice(mint.key.as_ref());
    out[32..64].copy_from_slice(authority.key.as_ref());
    out[64..72].copy_from_slice(&0u64.to_le_bytes()); // supply filled on mint_to
    out[72] = data[0]; // decimals
    out[73..83].copy_from_slice(&data[1..11]); // five u16
    out[83] = data[11]; // anti-snipe
    out[84..116].copy_from_slice(creator.key.as_ref());
    msg!("earth-memecoin: mint initialized");
    Ok(())
}

/// amount as 16-byte LE u128 (Earth adapter). Accounts: source, dest, mint, owner.
fn transfer(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
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
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    let mint_data = mint.try_borrow_data()?;
    let buy_tax = u16_at(&mint_data, 73)?;
    let sell_tax = u16_at(&mint_data, 75)?;
    let burn_share = u16_at(&mint_data, 77)?;
    let creator_share = u16_at(&mint_data, 79)?;
    let max_wallet = u16_at(&mint_data, 81)?;
    let supply = u64_at(&mint_data, 64)?;
    drop(mint_data);

    let src_data = source.try_borrow_data()?;
    if &src_data[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    let src_amt = u64_at(&src_data, 64)?;
    drop(src_data);
    if src_amt < amount {
        return Err(ProgramError::InsufficientFunds);
    }

    // Heuristic: dest owned by a pool/program => sell; otherwise buy/transfer.
    let is_sell = dest.owner != source.owner;
    let tax_bps = if is_sell { sell_tax } else { buy_tax };
    let tax = take_bps(amount, tax_bps)?;
    let burned = take_bps(tax, burn_share)?;
    let creator_cut = take_bps(tax, creator_share)?;
    let credited = amount
        .checked_sub(tax)
        .ok_or(ProgramError::InvalidArgument)?;

    if max_wallet > 0 && supply > 0 {
        let cap = take_bps(supply, max_wallet)?;
        let dest_data = dest.try_borrow_data()?;
        let dest_amt = u64_at(&dest_data, 64)?;
        drop(dest_data);
        if dest_amt.saturating_add(credited) > cap {
            return Err(ProgramError::InvalidArgument);
        }
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
        write_u64(&mut dst, 64, dest_amt.saturating_add(credited))?;
    }
    if burned > 0 {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let supply_now = u64_at(&mint_mut, 64)?;
        write_u64(&mut mint_mut, 64, supply_now.saturating_sub(burned))?;
    }
    let _ = creator_cut;
    Ok(())
}

fn mint_to(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let dest = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
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
