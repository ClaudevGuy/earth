//! Earth Mandate factory — an AI-agent native token standard.
//!
//! On-chain (enforced): treasury, levy, endowment, operator, destination
//! allowlist (1–3 owners), per-ACT cap, epoch cap, cooldown, pause.
//! Off-chain (not enforced as English): the mandate text is stored as a hash;
//! the model decides *when* to ACT. Instruction 3 is the only treasury spend.
//!
//! Token accounts match the Earth adapter spec (mint 32, owner 32, amount u64).
//! Instruction 1 is the Earth adapter transfer (discriminator 1, amount u128 LE).
//!
//! Mint layout (291 bytes):
//! 0 mint, 32 authority, 64 supply u64, 72 decimals,
//! 73 levy_bps, 75 epoch_spend_bps, 77 endowment_bps, 79 epoch_secs u32,
//! 83 operator, 115 mandate_hash, 147 treasury, 155 epoch_spent,
//! 163 epoch_start_ts, 171 paused, 172 max_act_bps, 174 cooldown_secs,
//! 178 last_act_ts, 186 act_count, 194 dest0, 226 dest1, 258 dest2, 290 dest_count.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    hash::hash,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::Sysvar,
};

entrypoint!(process_instruction);

pub const DISCRIMINATOR_INIT: u8 = 0;
pub const DISCRIMINATOR_TRANSFER: u8 = 1;
pub const DISCRIMINATOR_MINT_TO: u8 = 2;
pub const DISCRIMINATOR_ACT: u8 = 3;
pub const DISCRIMINATOR_SET_OPERATOR: u8 = 4;
pub const DISCRIMINATOR_SET_MANDATE: u8 = 5;
pub const DISCRIMINATOR_PAUSE: u8 = 6;
pub const DISCRIMINATOR_FUND: u8 = 7;
pub const DISCRIMINATOR_SET_ALLOWLIST: u8 = 8;

const TOKEN_LEN: usize = 72;
const MINT_LEN: usize = 291;
const DEST_OFF: usize = 194;

fn u16_at(data: &[u8], offset: usize) -> Result<u16, ProgramError> {
    Ok(u16::from_le_bytes(
        data.get(offset..offset + 2)
            .ok_or(ProgramError::InvalidAccountData)?
            .try_into()
            .unwrap(),
    ))
}

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

fn write_allowlist(mint: &mut [u8], dests: &[&Pubkey]) -> ProgramResult {
    if dests.is_empty() || dests.len() > 3 {
        return Err(ProgramError::InvalidArgument);
    }
    mint[DEST_OFF..DEST_OFF + 96].fill(0);
    for (i, dest) in dests.iter().enumerate() {
        if *dest == &Pubkey::default() {
            return Err(ProgramError::InvalidArgument);
        }
        let start = DEST_OFF + i * 32;
        mint[start..start + 32].copy_from_slice(dest.as_ref());
    }
    mint[290] = dests.len() as u8;
    Ok(())
}

fn dest_allowed(mint: &[u8], owner: &[u8]) -> bool {
    let n = mint.get(290).copied().unwrap_or(0) as usize;
    (0..n).any(|i| {
        let start = DEST_OFF + i * 32;
        mint.get(start..start + 32).map(|s| s == owner).unwrap_or(false)
    })
}

fn rollover_epoch(mint: &mut [u8], now: i64) -> ProgramResult {
    let epoch_secs = u32_at(mint, 79)?.max(1) as i64;
    let start = i64_at(mint, 163).unwrap_or(0);
    if start == 0 || now.saturating_sub(start) >= epoch_secs {
        write_i64(mint, 163, now)?;
        write_u64(mint, 155, 0)?;
    }
    Ok(())
}

pub fn process_instruction(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => transfer(accounts, &data[1..]),
        DISCRIMINATOR_MINT_TO => mint_to(accounts, &data[1..]),
        DISCRIMINATOR_ACT => act(accounts, &data[1..]),
        DISCRIMINATOR_SET_OPERATOR => set_operator(accounts),
        DISCRIMINATOR_SET_MANDATE => set_mandate(accounts, &data[1..]),
        DISCRIMINATOR_PAUSE => pause(accounts, &data[1..]),
        DISCRIMINATOR_FUND => fund(accounts, &data[1..]),
        DISCRIMINATOR_SET_ALLOWLIST => set_allowlist(accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// decimals u8, levy u16, epoch_spend u16, endowment u16, epoch_secs u32,
/// max_act_bps u16, cooldown_secs u32, mandate utf8
/// accounts: mint, authority, operator, dest0 [, dest1, dest2]
fn init_mint(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if accounts.len() < 4 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let mint = &accounts[0];
    let authority = &accounts[1];
    let operator = &accounts[2];
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 25 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mandate = &data[17..];
    if mandate.len() < 8 || mandate.len() > 512 {
        return Err(ProgramError::InvalidInstructionData);
    }
    if mint.data_len() < MINT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let dests: Vec<&Pubkey> = accounts[3..].iter().take(3).map(|a| a.key).collect();
    let mandate_hash = hash(mandate);
    let mut out = mint.try_borrow_mut_data()?;
    out[0..32].copy_from_slice(mint.key.as_ref());
    out[32..64].copy_from_slice(authority.key.as_ref());
    out[64..72].fill(0);
    out[72] = data[0];
    out[73..79].copy_from_slice(&data[1..7]);
    out[79..83].copy_from_slice(&data[7..11]);
    out[83..115].copy_from_slice(operator.key.as_ref());
    out[115..147].copy_from_slice(&mandate_hash.to_bytes());
    out[147..172].fill(0);
    out[172..174].copy_from_slice(&data[11..13]);
    out[174..178].copy_from_slice(&data[13..17]);
    out[178..194].fill(0);
    write_allowlist(&mut out, &dests)?;
    msg!("earth-agent: mandate initialized");
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

    let mint_data = mint.try_borrow_data()?;
    let levy_bps = u16_at(&mint_data, 73)?;
    drop(mint_data);
    let tax = take_bps(amount, levy_bps)?;
    let credited = amount.checked_sub(tax).ok_or(ProgramError::InvalidArgument)?;

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
    if tax > 0 {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let treasury = u64_at(&mint_mut, 147)?;
        write_u64(&mut mint_mut, 147, treasury.saturating_add(tax))?;
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
    let endowment = u16_at(&mint_data, 77)?;
    let supply = u64_at(&mint_data, 64)?;
    drop(mint_data);
    let seed = if supply == 0 { take_bps(amount, endowment)? } else { 0 };
    let to_dest = amount.checked_sub(seed).ok_or(ProgramError::InvalidArgument)?;
    {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let supply_now = u64_at(&mint_mut, 64)?;
        write_u64(&mut mint_mut, 64, supply_now.saturating_add(amount))?;
        if seed > 0 {
            let treasury = u64_at(&mint_mut, 147)?;
            write_u64(&mut mint_mut, 147, treasury.saturating_add(seed))?;
        }
    }
    {
        let mut dst = dest.try_borrow_mut_data()?;
        let dest_amt = u64_at(&dst, 64)?;
        write_u64(&mut dst, 64, dest_amt.saturating_add(to_dest))?;
    }
    Ok(())
}

fn act(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let dest = next_account_info(acc)?;
    let operator = next_account_info(acc)?;
    if !operator.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 16 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    let now = Clock::get()?.unix_timestamp;

    let dest_data = dest.try_borrow_data()?;
    if dest_data.len() < TOKEN_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if &dest_data[0..32] != mint.key.as_ref() {
        return Err(ProgramError::InvalidAccountData);
    }
    let dest_owner = dest_data[32..64].to_vec();
    let dest_amt = u64_at(&dest_data, 64)?;
    drop(dest_data);

    {
        let mint_data = mint.try_borrow_data()?;
        if mint_data.get(171).copied().unwrap_or(0) != 0 {
            return Err(ProgramError::InvalidAccountData);
        }
        if &mint_data[83..115] != operator.key.as_ref() {
            return Err(ProgramError::IllegalOwner);
        }
        if !dest_allowed(&mint_data, &dest_owner) {
            return Err(ProgramError::InvalidArgument);
        }
        let cooldown = u32_at(&mint_data, 174).unwrap_or(0) as i64;
        let last = i64_at(&mint_data, 178).unwrap_or(0);
        if cooldown > 0 && last != 0 && now.saturating_sub(last) < cooldown {
            return Err(ProgramError::InvalidArgument);
        }
        drop(mint_data);
    }
    {
        let mut mint_mut = mint.try_borrow_mut_data()?;
        rollover_epoch(&mut mint_mut, now)?;
        let treasury = u64_at(&mint_mut, 147)?;
        if amount > treasury {
            return Err(ProgramError::InsufficientFunds);
        }
        let max_act = take_bps(treasury, u16_at(&mint_mut, 172)?)?;
        if amount > max_act {
            return Err(ProgramError::InvalidArgument);
        }
        let cap_bps = u16_at(&mint_mut, 75)?;
        let spent = u64_at(&mint_mut, 155)?;
        let budget = take_bps(treasury.saturating_add(spent), cap_bps)?;
        if spent.saturating_add(amount) > budget {
            return Err(ProgramError::InvalidArgument);
        }
        write_u64(&mut mint_mut, 147, treasury - amount)?;
        write_u64(&mut mint_mut, 155, spent.saturating_add(amount))?;
        write_i64(&mut mint_mut, 178, now)?;
        let count = u64_at(&mint_mut, 186).unwrap_or(0);
        write_u64(&mut mint_mut, 186, count.saturating_add(1))?;
    }
    {
        let mut dst = dest.try_borrow_mut_data()?;
        write_u64(&mut dst, 64, dest_amt.saturating_add(amount))?;
    }
    msg!("earth-agent: act");
    Ok(())
}

fn set_operator(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    let operator = next_account_info(acc)?;
    require_authority(mint, authority)?;
    let mut out = mint.try_borrow_mut_data()?;
    out[83..115].copy_from_slice(operator.key.as_ref());
    Ok(())
}

fn set_mandate(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    require_authority(mint, authority)?;
    if data.len() < 8 || data.len() > 512 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mandate_hash = hash(data);
    let mut out = mint.try_borrow_mut_data()?;
    out[115..147].copy_from_slice(&mandate_hash.to_bytes());
    Ok(())
}

fn pause(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    require_authority(mint, authority)?;
    let paused = *data.first().unwrap_or(&1);
    let mut out = mint.try_borrow_mut_data()?;
    out[171] = if paused == 0 { 0 } else { 1 };
    Ok(())
}

fn fund(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let source = next_account_info(acc)?;
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    require_authority(mint, authority)?;
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let src_data = source.try_borrow_data()?;
    if &src_data[0..32] != mint.key.as_ref() {
        return Err(ProgramError::InvalidAccountData);
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
        let mut mint_mut = mint.try_borrow_mut_data()?;
        let treasury = u64_at(&mint_mut, 147)?;
        write_u64(&mut mint_mut, 147, treasury.saturating_add(amount))?;
    }
    Ok(())
}

fn set_allowlist(accounts: &[AccountInfo]) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let mint = &accounts[0];
    let authority = &accounts[1];
    require_authority(mint, authority)?;
    let dests: Vec<&Pubkey> = accounts[2..].iter().take(3).map(|a| a.key).collect();
    let mut out = mint.try_borrow_mut_data()?;
    write_allowlist(&mut out, &dests)?;
    Ok(())
}
