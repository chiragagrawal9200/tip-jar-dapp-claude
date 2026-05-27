use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("4qQrJUhbTubHVaiStBafsHmNtY2RWy3F7x8v91VSYXdW");

pub const MAX_FEE_BPS: u16 = 1000; // 10%
const PLATFORM_CONFIG_SEED: &[u8] = b"platform_config";
const TIP_JAR_SEED: &[u8] = b"tip_jar";

#[program]
pub mod tip_jar {
    use super::*;

    /// One-time setup: creates the global platform config PDA.
    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        fee_bps: u16,
    ) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, TipJarError::FeeTooHigh);

        let config = &mut ctx.accounts.platform_config;
        config.authority = ctx.accounts.authority.key();
        config.fee_receiver = ctx.accounts.fee_receiver.key();
        config.fee_bps = fee_bps;
        config.bump = ctx.bumps.platform_config;

        msg!("Platform initialized — fee: {} bps", fee_bps);
        Ok(())
    }

    /// Any wallet can register as a creator and mint their tip jar PDA.
    pub fn create_tip_jar(ctx: Context<CreateTipJar>, name: String) -> Result<()> {
        require!(
            !name.is_empty() && name.len() <= 50,
            TipJarError::InvalidName
        );

        let tip_jar = &mut ctx.accounts.tip_jar;
        tip_jar.creator = ctx.accounts.creator.key();
        tip_jar.name = name.clone();
        tip_jar.total_tips_received = 0;
        tip_jar.bump = ctx.bumps.tip_jar;

        msg!("Tip jar created for: {}", name);
        Ok(())
    }

    /// Supporter sends SOL; protocol splits it between creator and fee receiver.
    pub fn send_tip(ctx: Context<SendTip>, amount: u64) -> Result<()> {
        require!(amount > 0, TipJarError::InvalidAmount);

        let fee_bps = ctx.accounts.platform_config.fee_bps as u128;
        let fee_amount = (amount as u128)
            .checked_mul(fee_bps)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(TipJarError::ArithmeticOverflow)? as u64;

        let creator_amount = amount
            .checked_sub(fee_amount)
            .ok_or(TipJarError::ArithmeticOverflow)?;

        // Transfer creator share
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.supporter.to_account_info(),
                    to: ctx.accounts.creator.to_account_info(),
                },
            ),
            creator_amount,
        )?;

        // Transfer platform fee (skip when fee is zero to save compute)
        if fee_amount > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.supporter.to_account_info(),
                        to: ctx.accounts.fee_receiver.to_account_info(),
                    },
                ),
                fee_amount,
            )?;
        }

        let tip_jar = &mut ctx.accounts.tip_jar;
        tip_jar.total_tips_received = tip_jar
            .total_tips_received
            .checked_add(amount)
            .ok_or(TipJarError::ArithmeticOverflow)?;

        emit!(TipSent {
            supporter: ctx.accounts.supporter.key(),
            creator: ctx.accounts.creator.key(),
            gross_amount: amount,
            fee_amount,
            creator_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Tip sent — creator: {} lamports, fee: {} lamports",
            creator_amount,
            fee_amount
        );
        Ok(())
    }

    /// Platform authority can adjust the fee at any time (max 1000 bps).
    pub fn update_platform_fee(ctx: Context<UpdatePlatformFee>, new_fee_bps: u16) -> Result<()> {
        require!(new_fee_bps <= MAX_FEE_BPS, TipJarError::FeeTooHigh);
        ctx.accounts.platform_config.fee_bps = new_fee_bps;
        msg!("Platform fee updated to {} bps", new_fee_bps);
        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Arbitrary wallet that receives protocol fees.
    pub fee_receiver: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = PlatformConfig::SPACE,
        seeds = [PLATFORM_CONFIG_SEED],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTipJar<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = TipJar::SPACE,
        seeds = [TIP_JAR_SEED, creator.key().as_ref()],
        bump,
    )]
    pub tip_jar: Account<'info, TipJar>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SendTip<'info> {
    #[account(mut)]
    pub supporter: Signer<'info>,

    /// CHECK: Validated by constraint against tip_jar.creator.
    #[account(
        mut,
        constraint = creator.key() == tip_jar.creator @ TipJarError::InvalidCreator
    )]
    pub creator: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [TIP_JAR_SEED, creator.key().as_ref()],
        bump = tip_jar.bump,
    )]
    pub tip_jar: Account<'info, TipJar>,

    #[account(
        seeds = [PLATFORM_CONFIG_SEED],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    /// CHECK: Validated by constraint against platform_config.fee_receiver.
    #[account(
        mut,
        constraint = fee_receiver.key() == platform_config.fee_receiver @ TipJarError::InvalidFeeReceiver
    )]
    pub fee_receiver: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePlatformFee<'info> {
    #[account(
        constraint = authority.key() == platform_config.authority @ TipJarError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PLATFORM_CONFIG_SEED],
        bump = platform_config.bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
}

// ─── Account Structs ─────────────────────────────────────────────────────────

#[account]
pub struct PlatformConfig {
    pub authority: Pubkey,    // 32
    pub fee_receiver: Pubkey, // 32
    pub fee_bps: u16,         //  2
    pub bump: u8,             //  1
}

impl PlatformConfig {
    // discriminator(8) + authority(32) + fee_receiver(32) + fee_bps(2) + bump(1)
    pub const SPACE: usize = 8 + 32 + 32 + 2 + 1;
}

#[account]
pub struct TipJar {
    pub creator: Pubkey,          // 32
    pub name: String,             //  4 + 50 (length prefix + max bytes)
    pub total_tips_received: u64, //  8
    pub bump: u8,                 //  1
}

impl TipJar {
    // discriminator(8) + creator(32) + name(4+50) + total_tips_received(8) + bump(1)
    pub const SPACE: usize = 8 + 32 + (4 + 50) + 8 + 1;
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct TipSent {
    pub supporter: Pubkey,
    pub creator: Pubkey,
    pub gross_amount: u64,
    pub fee_amount: u64,
    pub creator_amount: u64,
    pub timestamp: i64,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum TipJarError {
    #[msg("Fee cannot exceed 1000 basis points (10%)")]
    FeeTooHigh,
    #[msg("Name must be between 1 and 50 characters")]
    InvalidName,
    #[msg("Tip amount must be greater than 0")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Creator wallet does not match this tip jar")]
    InvalidCreator,
    #[msg("Fee receiver does not match platform config")]
    InvalidFeeReceiver,
    #[msg("Only the platform authority can perform this action")]
    Unauthorized,
}
