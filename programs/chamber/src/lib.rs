//! Earth Chamber factory — DAO governance token.
//!
//! Ethereum Governor + timelock + voting-token systems let token holders
//! propose, vote, queue, and execute without a middleman. Chamber is that
//! idea as a token standard: 1 token = 1 vote (or the account’s delegate),
//! one active proposal on the mint, quorum + voting period + timelock, and
//! an optional transfer levy into the DAO treasury. Execute records the
//! action hash; it does not CPI an arbitrary program in this factory.
//!
//! Token accounts match the Earth adapter spec (mint 32, owner 32, amount u64)
//! then delegate pubkey + last-voted proposal id. Instruction 1 is the Earth
//! adapter transfer (discriminator 1, amount u128 LE).

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
pub const DISCRIMINATOR_PROPOSE: u8 = 3;
pub const DISCRIMINATOR_VOTE: u8 = 4;
pub const DISCRIMINATOR_QUEUE: u8 = 5;
pub const DISCRIMINATOR_EXECUTE: u8 = 6;
pub const DISCRIMINATOR_DELEGATE: u8 = 7;

const TOKEN_LEN: usize = 112;
const MINT_LEN: usize = 200;

const STATUS_ACTIVE: u8 = 1;
const STATUS_QUEUED: u8 = 2;
const STATUS_EXECUTED: u8 = 3;
const STATUS_DEFEATED: u8 = 4;

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

fn voter_ok(token: &[u8], signer: &Pubkey) -> bool {
    if token.len() < TOKEN_LEN {
        return false;
    }
    &token[32..64] == signer.as_ref() || &token[72..104] == signer.as_ref()
}

pub fn process_instruction(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let tag = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        DISCRIMINATOR_INIT => init_mint(accounts, &data[1..]),
        DISCRIMINATOR_TRANSFER => transfer(accounts, &data[1..]),
        DISCRIMINATOR_MINT_TO => mint_to(accounts, &data[1..]),
        DISCRIMINATOR_PROPOSE => propose(accounts, &data[1..]),
        DISCRIMINATOR_VOTE => vote(accounts, &data[1..]),
        DISCRIMINATOR_QUEUE => queue(accounts),
        DISCRIMINATOR_EXECUTE => execute(accounts),
        DISCRIMINATOR_DELEGATE => delegate(accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// decimals u8, quorum_bps u16, threshold_bps u16, voting_secs u32, timelock_secs u32, treasury_bps u16
fn init_mint(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let authority = next_account_info(acc)?;
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 15 {
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
    out[73..87].copy_from_slice(&data[1..15]);
    out[87..200].fill(0);
    msg!("earth-chamber: initialized");
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
    let levy_bps = u16_at(&mint_data, 85).unwrap_or(0);
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
        let treasury = u64_at(&mint_mut, 87)?;
        write_u64(&mut mint_mut, 87, treasury.saturating_add(tax))?;
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
        if dst.len() < TOKEN_LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let dest_amt = u64_at(&dst, 64)?;
        write_u64(&mut dst, 64, dest_amt.saturating_add(amount))?;
    }
    Ok(())
}

/// Accounts: mint, voter token, proposer. Payload = action utf8 (hashed on-chain).
fn propose(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let token = next_account_info(acc)?;
    let proposer = next_account_info(acc)?;
    if !proposer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 8 || data.len() > 512 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let token_data = token.try_borrow_data()?;
    if !voter_ok(&token_data, proposer.key) {
        return Err(ProgramError::IllegalOwner);
    }
    let weight = u64_at(&token_data, 64)?;
    drop(token_data);
    let mint_data = mint.try_borrow_data()?;
    let status = mint_data.get(135).copied().unwrap_or(0);
    if status == STATUS_ACTIVE || status == STATUS_QUEUED {
        return Err(ProgramError::InvalidAccountData);
    }
    let supply = u64_at(&mint_data, 64)?;
    let threshold = take_bps(supply, u16_at(&mint_data, 75)?)?;
    drop(mint_data);
    if weight < threshold || weight == 0 {
        return Err(ProgramError::InsufficientFunds);
    }
    let action_hash = hash(data);
    let now = Clock::get()?.unix_timestamp;
    {
        let mut out = mint.try_borrow_mut_data()?;
        let next_id = u64_at(&out, 95)?.saturating_add(1);
        write_u64(&mut out, 95, next_id)?;
        write_u64(&mut out, 103, 0)?;
        write_u64(&mut out, 111, 0)?;
        write_i64(&mut out, 119, now)?;
        write_i64(&mut out, 127, 0)?;
        out[135] = STATUS_ACTIVE;
        out[136..168].copy_from_slice(proposer.key.as_ref());
        out[168..200].copy_from_slice(&action_hash.to_bytes());
    }
    msg!("earth-chamber: proposed");
    Ok(())
}

/// data[0] = 1 for, 0 against. Accounts: mint, voter token, voter.
fn vote(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let token = next_account_info(acc)?;
    let voter = next_account_info(acc)?;
    if !voter.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let support = *data.first().unwrap_or(&0);
    let now = Clock::get()?.unix_timestamp;
    let mint_data = mint.try_borrow_data()?;
    if mint_data.get(135).copied().unwrap_or(0) != STATUS_ACTIVE {
        return Err(ProgramError::InvalidAccountData);
    }
    let start = i64_at(&mint_data, 119)?;
    let period = u32_at(&mint_data, 77)? as i64;
    let proposal_id = u64_at(&mint_data, 95)?;
    drop(mint_data);
    if now < start || now >= start.saturating_add(period.max(1)) {
        return Err(ProgramError::InvalidArgument);
    }
    {
        let mut tok = token.try_borrow_mut_data()?;
        if !voter_ok(&tok, voter.key) {
            return Err(ProgramError::IllegalOwner);
        }
        let last = u64_at(&tok, 104)?;
        if last == proposal_id {
            return Err(ProgramError::InvalidAccountData);
        }
        let weight = u64_at(&tok, 64)?;
        if weight == 0 {
            return Err(ProgramError::InsufficientFunds);
        }
        write_u64(&mut tok, 104, proposal_id)?;
        drop(tok);
        let mut mint_mut = mint.try_borrow_mut_data()?;
        if support == 0 {
            let against = u64_at(&mint_mut, 111)?;
            write_u64(&mut mint_mut, 111, against.saturating_add(weight))?;
        } else {
            let yes = u64_at(&mint_mut, 103)?;
            write_u64(&mut mint_mut, 103, yes.saturating_add(weight))?;
        }
    }
    Ok(())
}

fn queue(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let now = Clock::get()?.unix_timestamp;
    let mut out = mint.try_borrow_mut_data()?;
    if out.get(135).copied().unwrap_or(0) != STATUS_ACTIVE {
        return Err(ProgramError::InvalidAccountData);
    }
    let start = i64_at(&out, 119)?;
    let period = u32_at(&out, 77)? as i64;
    if now < start.saturating_add(period.max(1)) {
        return Err(ProgramError::InvalidArgument);
    }
    let yes = u64_at(&out, 103)?;
    let against = u64_at(&out, 111)?;
    let supply = u64_at(&out, 64)?;
    let quorum = take_bps(supply, u16_at(&out, 73)?)?;
    if yes > against && yes >= quorum {
        let lock = u32_at(&out, 81)? as i64;
        write_i64(&mut out, 127, now.saturating_add(lock))?;
        out[135] = STATUS_QUEUED;
        msg!("earth-chamber: queued");
    } else {
        out[135] = STATUS_DEFEATED;
        msg!("earth-chamber: defeated");
    }
    Ok(())
}

fn execute(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let mint = next_account_info(acc)?;
    let now = Clock::get()?.unix_timestamp;
    let mut out = mint.try_borrow_mut_data()?;
    if out.get(135).copied().unwrap_or(0) != STATUS_QUEUED {
        return Err(ProgramError::InvalidAccountData);
    }
    let eta = i64_at(&out, 127)?;
    if now < eta {
        return Err(ProgramError::InvalidArgument);
    }
    out[135] = STATUS_EXECUTED;
    msg!("earth-chamber: executed");
    Ok(())
}

fn delegate(accounts: &[AccountInfo]) -> ProgramResult {
    let acc = &mut accounts.iter();
    let token = next_account_info(acc)?;
    let owner = next_account_info(acc)?;
    let to = next_account_info(acc)?;
    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mut data = token.try_borrow_mut_data()?;
    if data.len() < TOKEN_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if &data[32..64] != owner.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }
    data[72..104].copy_from_slice(to.key.as_ref());
    Ok(())
}
