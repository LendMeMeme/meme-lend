use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use spl_token_2022::extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions};

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Meme Lend",
    project_url: "https://meme-lendweb-production.up.railway.app",
    contacts: "link:https://github.com/LendMeMeme/meme-lend/security/advisories/new",
    policy: "https://github.com/LendMeMeme/meme-lend/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/LendMeMeme/meme-lend"
}

#[cfg(all(test, not(feature = "no-entrypoint")))]
mod security_metadata_tests {
    #[test]
    fn embeds_responsible_disclosure_metadata() {
        assert!(super::SECURITY_TXT.contains("Meme Lend"));
        assert!(super::SECURITY_TXT.contains("security/advisories/new"));
        assert!(super::SECURITY_TXT.contains("SECURITY.md"));
    }
}

pub mod constants;
pub mod errors;
pub mod events;
pub mod math;
pub mod state;

use constants::*;
use errors::LendingError;
use events::*;
use state::*;

declare_id!("9VHZhNZkrsocLmafGBmbG2mCiAnwA1WaBTG1aNb2kr4j");

#[program]
pub mod meme_lending {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        max_oracle_age_seconds: u32,
    ) -> Result<()> {
        require!(max_oracle_age_seconds > 0, LendingError::InvalidParameter);
        let config = &mut ctx.accounts.global_config;
        config.authority = ctx.accounts.authority.key();
        config.pending_authority = Pubkey::default();
        config.approved_loan_mint = ctx.accounts.loan_mint.key();
        config.protocol_fee_recipient = ctx.accounts.protocol_fee_recipient.key();
        config.market_count = 0;
        config.max_oracle_age_seconds = max_oracle_age_seconds;
        config.paused = false;
        config.bump = ctx.bumps.global_config;
        emit!(ProtocolInitialized {
            authority: config.authority,
            loan_mint: config.approved_loan_mint,
        });
        Ok(())
    }

    pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        validate_market_args(&ctx, &args)?;
        let market = &mut ctx.accounts.market;
        market.global_config = ctx.accounts.global_config.key();
        market.creator = ctx.accounts.creator.key();
        market.collateral_mint = ctx.accounts.collateral_mint.key();
        market.loan_mint = ctx.accounts.loan_mint.key();
        market.collateral_token_program = ctx.accounts.collateral_token_program.key();
        market.loan_token_program = ctx.accounts.loan_token_program.key();
        market.liquidity_vault = ctx.accounts.liquidity_vault.key();
        market.collateral_vault = ctx.accounts.collateral_vault.key();
        market.oracle_configuration = ctx.accounts.oracle_configuration.key();
        market.active_rewards = Pubkey::default();
        market.config_hash = args.config_hash;
        market.lltv_bps = args.lltv_bps;
        market.liquidation_bonus_bps = args.liquidation_bonus_bps;
        market.close_factor_bps = args.close_factor_bps;
        market.creator_fee_bps = args.creator_fee_bps;
        market.protocol_fee_bps = args.protocol_fee_bps;
        market.rate_model = args.rate_model.clone();
        market.market_borrow_cap = args.market_borrow_cap;
        market.wallet_borrow_cap = args.wallet_borrow_cap;
        market.total_supply_shares = 0;
        market.total_borrow_shares = 0;
        market.borrow_index = RATE_SCALE;
        market.total_debt = 0;
        market.bad_debt = 0;
        market.creator_fees_claimable = 0;
        market.protocol_fees_claimable = 0;
        market.last_accrual_timestamp = Clock::get()?.unix_timestamp;
        market.borrowing_paused = false;
        market.bump = ctx.bumps.market;
        market.authority_bump = ctx.bumps.market_authority;

        let oracle = &mut ctx.accounts.oracle_configuration;
        oracle.market = market.key();
        oracle.kind = args.oracle_kind;
        oracle.collateral_mint = market.collateral_mint;
        oracle.loan_mint = market.loan_mint;
        oracle.max_age_seconds = args.oracle_max_age_seconds;
        oracle.max_confidence_bps = args.oracle_max_confidence_bps;
        oracle.max_deviation_bps = args.oracle_max_deviation_bps;
        oracle.price_decimals = args.oracle_price_decimals;
        oracle.source_count =
            u8::try_from(args.oracle_sources.len()).map_err(|_| LendingError::InvalidParameter)?;
        oracle.sources = args.oracle_sources;
        oracle.custom_high_risk = oracle.kind == OracleKind::Custom;
        oracle.bump = ctx.bumps.oracle_configuration;

        let reserve = &mut ctx.accounts.first_loss_reserve;
        reserve.market = market.key();
        reserve.vault = ctx.accounts.reserve_vault.key();
        reserve.deposited = 0;
        reserve.absorbed_losses = 0;
        reserve.bump = ctx.bumps.first_loss_reserve;

        ctx.accounts.global_config.market_count = ctx
            .accounts
            .global_config
            .market_count
            .checked_add(1)
            .ok_or(LendingError::MathOverflow)?;
        emit!(MarketCreated {
            market: market.key(),
            creator: market.creator,
            collateral_mint: market.collateral_mint,
            loan_mint: market.loan_mint,
            config_hash: market.config_hash,
            custom_oracle_high_risk: oracle.custom_high_risk,
        });
        Ok(())
    }

    pub fn set_protocol_pause(ctx: Context<SetProtocolPause>, paused: bool) -> Result<()> {
        ctx.accounts.global_config.paused = paused;
        emit!(ProtocolPauseChanged {
            authority: ctx.accounts.authority.key(),
            paused,
        });
        Ok(())
    }

    pub fn pause_market(ctx: Context<PauseMarket>, paused: bool) -> Result<()> {
        require!(
            ctx.accounts.market.creator == ctx.accounts.authority.key()
                || ctx.accounts.global_config.authority == ctx.accounts.authority.key(),
            LendingError::Unauthorized
        );
        ctx.accounts.market.borrowing_paused = paused;
        emit!(MarketPauseChanged {
            market: ctx.accounts.market.key(),
            borrowing_paused: paused
        });
        Ok(())
    }

    pub fn accrue_interest(ctx: Context<AccrueInterest>) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        accrue_market(
            &mut ctx.accounts.market,
            market_key,
            ctx.accounts.liquidity_vault.amount,
        )
    }

    pub fn supply_usdc(ctx: Context<SupplyUsdc>, amount: u64) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        accrue_market(
            &mut ctx.accounts.market,
            market_key,
            ctx.accounts.liquidity_vault.amount,
        )?;
        let assets_before =
            net_market_assets(&ctx.accounts.market, ctx.accounts.liquidity_vault.amount)?;
        let shares = math::assets_to_shares(
            amount,
            assets_before,
            ctx.accounts.market.total_supply_shares,
        )?;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.loan_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.lender_usdc.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.liquidity_vault.to_account_info(),
                    authority: ctx.accounts.lender.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.loan_mint.decimals,
        )?;

        let position = &mut ctx.accounts.lender_position;
        if position.owner == Pubkey::default() {
            position.market = ctx.accounts.market.key();
            position.owner = ctx.accounts.lender.key();
            position.bump = ctx.bumps.lender_position;
        }
        settle_lender_rewards(
            &ctx.accounts.market,
            position,
            ctx.accounts.market_rewards.as_ref(),
        )?;
        position.supply_shares = position
            .supply_shares
            .checked_add(shares)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_supply_shares = ctx
            .accounts
            .market
            .total_supply_shares
            .checked_add(shares)
            .ok_or(LendingError::MathOverflow)?;
        emit!(LiquiditySupplied {
            market: ctx.accounts.market.key(),
            lender: ctx.accounts.lender.key(),
            assets: amount,
            shares
        });
        Ok(())
    }

    pub fn withdraw_usdc(ctx: Context<WithdrawUsdc>, shares: u128) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        accrue_market(
            &mut ctx.accounts.market,
            market_key,
            ctx.accounts.liquidity_vault.amount,
        )?;
        require!(
            ctx.accounts.lender_position.supply_shares >= shares,
            LendingError::InsufficientLiquidity
        );
        settle_lender_rewards(
            &ctx.accounts.market,
            &mut ctx.accounts.lender_position,
            ctx.accounts.market_rewards.as_ref(),
        )?;
        let total_assets =
            net_market_assets(&ctx.accounts.market, ctx.accounts.liquidity_vault.amount)?;
        let assets = math::shares_to_assets(
            shares,
            total_assets,
            ctx.accounts.market.total_supply_shares,
        )?;
        require!(
            ctx.accounts.liquidity_vault.amount >= assets,
            LendingError::InsufficientLiquidity
        );

        ctx.accounts.lender_position.supply_shares = ctx
            .accounts
            .lender_position
            .supply_shares
            .checked_sub(shares)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_supply_shares = ctx
            .accounts
            .market
            .total_supply_shares
            .checked_sub(shares)
            .ok_or(LendingError::MathOverflow)?;
        let signer_seeds: &[&[u8]] = &[
            b"market-authority",
            market_key.as_ref(),
            &[ctx.accounts.market.authority_bump],
        ];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.loan_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.liquidity_vault.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.lender_usdc.to_account_info(),
                    authority: ctx.accounts.market_authority.to_account_info(),
                },
                &[signer_seeds],
            ),
            assets,
            ctx.accounts.loan_mint.decimals,
        )?;
        emit!(LiquidityWithdrawn {
            market: market_key,
            lender: ctx.accounts.lender.key(),
            assets,
            shares
        });
        Ok(())
    }

    pub fn submit_oracle_observation(
        ctx: Context<SubmitOracleObservation>,
        price: u128,
        confidence_bps: u16,
        deviation_bps: u16,
        max_recoverable_usdc: u64,
        published_at: i64,
        sequence: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.oracle_configuration;
        require!(
            config.kind == OracleKind::Custom,
            LendingError::InvalidOracle
        );
        require!(
            config.sources.contains(&ctx.accounts.publisher.key()),
            LendingError::Unauthorized
        );
        require!(
            price > 0 && max_recoverable_usdc > 0,
            LendingError::InvalidOracle
        );
        require!(
            confidence_bps <= config.max_confidence_bps,
            LendingError::InvalidOracle
        );
        require!(
            deviation_bps <= config.max_deviation_bps,
            LendingError::InvalidOracle
        );
        let now = Clock::get()?.unix_timestamp;
        require!(
            published_at <= now
                && now
                    .checked_sub(published_at)
                    .ok_or(LendingError::MathOverflow)?
                    <= i64::from(config.max_age_seconds),
            LendingError::OracleUnavailable
        );
        let observation = &mut ctx.accounts.oracle_observation;
        require!(
            sequence > observation.sequence || observation.publisher == Pubkey::default(),
            LendingError::InvalidOracle
        );
        observation.market = ctx.accounts.market.key();
        observation.publisher = ctx.accounts.publisher.key();
        observation.price = price;
        observation.confidence_bps = confidence_bps;
        observation.deviation_bps = deviation_bps;
        observation.max_recoverable_usdc = max_recoverable_usdc;
        observation.published_at = published_at;
        observation.sequence = sequence;
        observation.bump = ctx.bumps.oracle_observation;
        emit!(OracleObserved {
            market: observation.market,
            publisher: observation.publisher,
            price,
            max_recoverable_usdc,
            published_at,
            sequence
        });
        Ok(())
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, LendingError::AmountTooSmall);
        transfer_checked(
            CpiContext::new(
                ctx.accounts.collateral_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.borrower_collateral.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.collateral_vault.to_account_info(),
                    authority: ctx.accounts.borrower.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.collateral_mint.decimals,
        )?;
        let position = &mut ctx.accounts.borrower_position;
        if position.owner == Pubkey::default() {
            position.market = ctx.accounts.market.key();
            position.owner = ctx.accounts.borrower.key();
            position.bump = ctx.bumps.borrower_position;
        }
        position.collateral_amount = position
            .collateral_amount
            .checked_add(amount)
            .ok_or(LendingError::MathOverflow)?;
        emit!(CollateralDeposited {
            market: ctx.accounts.market.key(),
            borrower: ctx.accounts.borrower.key(),
            amount
        });
        Ok(())
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        validate_oracle(
            &ctx.accounts.oracle_configuration,
            &ctx.accounts.oracle_observation,
            Clock::get()?.unix_timestamp,
        )?;
        require!(
            ctx.accounts.borrower_position.collateral_amount >= amount && amount > 0,
            LendingError::InsufficientLiquidity
        );
        let remaining = ctx
            .accounts
            .borrower_position
            .collateral_amount
            .checked_sub(amount)
            .ok_or(LendingError::MathOverflow)?;
        let debt = math::shares_to_debt_ceil(
            ctx.accounts.borrower_position.borrow_shares,
            ctx.accounts.market.borrow_index,
        )
        .unwrap_or(0);
        require_healthy(
            remaining,
            ctx.accounts.collateral_mint.decimals,
            debt,
            ctx.accounts.oracle_observation.price,
            ctx.accounts.oracle_configuration.price_decimals,
            ctx.accounts.market.lltv_bps,
        )?;
        ctx.accounts.borrower_position.collateral_amount = remaining;
        transfer_from_market_collateral(&ctx, amount)?;
        emit!(CollateralWithdrawn {
            market: ctx.accounts.market.key(),
            borrower: ctx.accounts.borrower.key(),
            amount
        });
        Ok(())
    }

    pub fn borrow_usdc(ctx: Context<BorrowUsdc>, amount: u64) -> Result<()> {
        require!(
            !ctx.accounts.global_config.paused && !ctx.accounts.market.borrowing_paused,
            LendingError::Paused
        );
        validate_oracle(
            &ctx.accounts.oracle_configuration,
            &ctx.accounts.oracle_observation,
            Clock::get()?.unix_timestamp,
        )?;
        let market_key = ctx.accounts.market.key();
        accrue_market(
            &mut ctx.accounts.market,
            market_key,
            ctx.accounts.liquidity_vault.amount,
        )?;
        require!(
            amount > 0 && amount <= ctx.accounts.liquidity_vault.amount,
            LendingError::InsufficientLiquidity
        );
        let current_debt = if ctx.accounts.borrower_position.borrow_shares == 0 {
            0
        } else {
            math::shares_to_debt_ceil(
                ctx.accounts.borrower_position.borrow_shares,
                ctx.accounts.market.borrow_index,
            )?
        };
        let resulting_debt = current_debt
            .checked_add(amount)
            .ok_or(LendingError::MathOverflow)?;
        require!(
            u128::from(ctx.accounts.market.total_debt)
                .checked_add(u128::from(amount))
                .ok_or(LendingError::MathOverflow)?
                <= u128::from(ctx.accounts.market.market_borrow_cap),
            LendingError::InsufficientLiquidity
        );
        require!(
            resulting_debt <= ctx.accounts.market.wallet_borrow_cap
                && resulting_debt <= ctx.accounts.oracle_observation.max_recoverable_usdc,
            LendingError::UnhealthyPosition
        );
        require_healthy(
            ctx.accounts.borrower_position.collateral_amount,
            ctx.accounts.collateral_mint.decimals,
            resulting_debt,
            ctx.accounts.oracle_observation.price,
            ctx.accounts.oracle_configuration.price_decimals,
            ctx.accounts.market.lltv_bps,
        )?;
        let shares = math::debt_to_shares_ceil(amount, ctx.accounts.market.borrow_index)?;
        ctx.accounts.borrower_position.borrow_shares = ctx
            .accounts
            .borrower_position
            .borrow_shares
            .checked_add(shares)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_borrow_shares = ctx
            .accounts
            .market
            .total_borrow_shares
            .checked_add(shares)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_debt = ctx
            .accounts
            .market
            .total_debt
            .checked_add(u128::from(amount))
            .ok_or(LendingError::MathOverflow)?;
        transfer_market_usdc(&ctx, amount)?;
        emit!(UsdcBorrowed {
            market: market_key,
            borrower: ctx.accounts.borrower.key(),
            amount,
            debt_shares: shares
        });
        Ok(())
    }

    pub fn repay_usdc(ctx: Context<RepayUsdc>, requested_amount: u64) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        accrue_market(
            &mut ctx.accounts.market,
            market_key,
            ctx.accounts.liquidity_vault.amount,
        )?;
        let debt = math::shares_to_debt_ceil(
            ctx.accounts.borrower_position.borrow_shares,
            ctx.accounts.market.borrow_index,
        )?;
        let amount = requested_amount.min(debt);
        require!(amount > 0, LendingError::AmountTooSmall);
        let shares = if amount == debt {
            ctx.accounts.borrower_position.borrow_shares
        } else {
            math::mul_div_floor(
                u128::from(amount),
                ctx.accounts.borrower_position.borrow_shares,
                u128::from(debt),
            )?
        };
        require!(shares > 0, LendingError::AmountTooSmall);
        transfer_checked(
            CpiContext::new(
                ctx.accounts.loan_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.payer_usdc.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.liquidity_vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.loan_mint.decimals,
        )?;
        ctx.accounts.borrower_position.borrow_shares = ctx
            .accounts
            .borrower_position
            .borrow_shares
            .checked_sub(shares)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_borrow_shares = ctx
            .accounts
            .market
            .total_borrow_shares
            .checked_sub(shares)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_debt = ctx
            .accounts
            .market
            .total_debt
            .checked_sub(u128::from(amount))
            .ok_or(LendingError::MathOverflow)?;
        emit!(UsdcRepaid {
            market: market_key,
            payer: ctx.accounts.payer.key(),
            borrower: ctx.accounts.borrower_position.owner,
            amount,
            debt_shares: shares
        });
        Ok(())
    }

    pub fn deposit_first_loss_reserve(
        ctx: Context<DepositFirstLossReserve>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, LendingError::AmountTooSmall);
        transfer_checked(
            CpiContext::new(
                ctx.accounts.loan_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.contributor_usdc.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.reserve_vault.to_account_info(),
                    authority: ctx.accounts.contributor.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.loan_mint.decimals,
        )?;
        ctx.accounts.first_loss_reserve.deposited = ctx
            .accounts
            .first_loss_reserve
            .deposited
            .checked_add(amount)
            .ok_or(LendingError::MathOverflow)?;
        emit!(FirstLossReserveFunded {
            market: ctx.accounts.market.key(),
            contributor: ctx.accounts.contributor.key(),
            amount
        });
        Ok(())
    }

    pub fn claim_market_creator_fees(ctx: Context<ClaimCreatorFees>, amount: u64) -> Result<()> {
        require!(
            amount > 0 && amount <= ctx.accounts.market.creator_fees_claimable,
            LendingError::InsufficientLiquidity
        );
        require!(
            amount <= ctx.accounts.liquidity_vault.amount,
            LendingError::InsufficientLiquidity
        );
        ctx.accounts.market.creator_fees_claimable = ctx
            .accounts
            .market
            .creator_fees_claimable
            .checked_sub(amount)
            .ok_or(LendingError::MathOverflow)?;
        let market_key = ctx.accounts.market.key();
        let seeds: &[&[u8]] = &[
            b"market-authority",
            market_key.as_ref(),
            &[ctx.accounts.market.authority_bump],
        ];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.loan_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.liquidity_vault.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.creator_usdc.to_account_info(),
                    authority: ctx.accounts.market_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.loan_mint.decimals,
        )?;
        emit!(CreatorFeesClaimed {
            market: market_key,
            creator: ctx.accounts.creator.key(),
            amount
        });
        Ok(())
    }

    pub fn claim_protocol_fees(ctx: Context<ClaimProtocolFees>, amount: u64) -> Result<()> {
        require!(amount > 0, LendingError::AmountTooSmall);
        let market_key = ctx.accounts.market.key();
        accrue_market(
            &mut ctx.accounts.market,
            market_key,
            ctx.accounts.liquidity_vault.amount,
        )?;
        require!(
            ctx.accounts.market.protocol_fees_claimable >= amount,
            LendingError::InsufficientLiquidity
        );
        ctx.accounts.market.protocol_fees_claimable = ctx
            .accounts
            .market
            .protocol_fees_claimable
            .checked_sub(amount)
            .ok_or(LendingError::MathOverflow)?;
        let seeds: &[&[u8]] = &[
            b"market-authority",
            market_key.as_ref(),
            &[ctx.accounts.market.authority_bump],
        ];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.loan_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.liquidity_vault.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.recipient_usdc.to_account_info(),
                    authority: ctx.accounts.market_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.loan_mint.decimals,
        )?;
        emit!(ProtocolFeesClaimed {
            market: market_key,
            recipient: ctx.accounts.protocol_fee_recipient.key(),
            amount,
        });
        Ok(())
    }

    pub fn liquidate(ctx: Context<Liquidate>, requested_repay: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        validate_oracle(
            &ctx.accounts.oracle_configuration,
            &ctx.accounts.oracle_observation,
            now,
        )?;
        let market_key = ctx.accounts.market.key();
        accrue_market(
            &mut ctx.accounts.market,
            market_key,
            ctx.accounts.liquidity_vault.amount,
        )?;
        let debt = math::shares_to_debt_ceil(
            ctx.accounts.borrower_position.borrow_shares,
            ctx.accounts.market.borrow_index,
        )?;
        let value = math::collateral_value(
            ctx.accounts.borrower_position.collateral_amount,
            ctx.accounts.collateral_mint.decimals,
            ctx.accounts.oracle_observation.price,
            ctx.accounts.oracle_configuration.price_decimals,
        )?;
        require!(
            debt > math::max_debt_for_collateral(value, ctx.accounts.market.lltv_bps)?,
            LendingError::PositionHealthy
        );
        let (repaid, seized) = math::liquidation_amounts(
            requested_repay,
            debt,
            ctx.accounts.borrower_position.collateral_amount,
            ctx.accounts.collateral_mint.decimals,
            ctx.accounts.oracle_observation.price,
            ctx.accounts.oracle_configuration.price_decimals,
            ctx.accounts.market.close_factor_bps,
            ctx.accounts.market.liquidation_bonus_bps,
        )?;
        transfer_checked(
            CpiContext::new(
                ctx.accounts.loan_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.liquidator_usdc.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.liquidity_vault.to_account_info(),
                    authority: ctx.accounts.liquidator.to_account_info(),
                },
            ),
            repaid,
            ctx.accounts.loan_mint.decimals,
        )?;
        let shares = math::liquidation_shares_to_burn(
            repaid,
            debt,
            ctx.accounts.borrower_position.borrow_shares,
        )?;
        ctx.accounts.borrower_position.borrow_shares = ctx
            .accounts
            .borrower_position
            .borrow_shares
            .checked_sub(shares)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.borrower_position.collateral_amount = ctx
            .accounts
            .borrower_position
            .collateral_amount
            .checked_sub(seized)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_borrow_shares = ctx
            .accounts
            .market
            .total_borrow_shares
            .checked_sub(shares)
            .ok_or(LendingError::MathOverflow)?;
        ctx.accounts.market.total_debt = ctx
            .accounts
            .market
            .total_debt
            .checked_sub(u128::from(repaid))
            .ok_or(LendingError::MathOverflow)?;
        transfer_liquidation_collateral(&ctx, seized)?;

        let mut bad_debt = 0_u64;
        let mut absorbed = 0_u64;
        if ctx.accounts.borrower_position.collateral_amount == 0
            && ctx.accounts.borrower_position.borrow_shares > 0
        {
            bad_debt = math::shares_to_debt_ceil(
                ctx.accounts.borrower_position.borrow_shares,
                ctx.accounts.market.borrow_index,
            )?;
            ctx.accounts.market.total_borrow_shares = ctx
                .accounts
                .market
                .total_borrow_shares
                .checked_sub(ctx.accounts.borrower_position.borrow_shares)
                .ok_or(LendingError::MathOverflow)?;
            ctx.accounts.market.total_debt = ctx
                .accounts
                .market
                .total_debt
                .checked_sub(u128::from(bad_debt))
                .ok_or(LendingError::MathOverflow)?;
            ctx.accounts.borrower_position.borrow_shares = 0;
            ctx.accounts.market.bad_debt = ctx
                .accounts
                .market
                .bad_debt
                .checked_add(bad_debt)
                .ok_or(LendingError::MathOverflow)?;
            absorbed = bad_debt.min(ctx.accounts.reserve_vault.amount);
            if absorbed > 0 {
                transfer_reserve_to_liquidity(&ctx, absorbed)?;
                ctx.accounts.first_loss_reserve.deposited = ctx
                    .accounts
                    .first_loss_reserve
                    .deposited
                    .checked_sub(absorbed)
                    .ok_or(LendingError::MathOverflow)?;
                ctx.accounts.first_loss_reserve.absorbed_losses = ctx
                    .accounts
                    .first_loss_reserve
                    .absorbed_losses
                    .checked_add(absorbed)
                    .ok_or(LendingError::MathOverflow)?;
            }
        }
        emit!(PositionLiquidated {
            market: market_key,
            borrower: ctx.accounts.borrower_position.owner,
            liquidator: ctx.accounts.liquidator.key(),
            repaid,
            collateral_seized: seized,
            bad_debt,
            reserve_absorbed: absorbed
        });
        Ok(())
    }

    pub fn fund_lender_rewards(ctx: Context<FundLenderRewards>, amount: u64) -> Result<()> {
        require!(amount > 0, LendingError::AmountTooSmall);
        let rewards = &mut ctx.accounts.market_rewards;
        if rewards.market == Pubkey::default() {
            rewards.market = ctx.accounts.market.key();
            rewards.reward_mint = ctx.accounts.reward_mint.key();
            rewards.reward_vault = ctx.accounts.reward_vault.key();
            rewards.reward_index = 0;
            rewards.undistributed_rewards = 0;
            rewards.bump = ctx.bumps.market_rewards;
        }
        require_keys_eq!(
            rewards.market,
            ctx.accounts.market.key(),
            LendingError::MarketMismatch
        );
        require_keys_eq!(
            rewards.reward_mint,
            ctx.accounts.reward_mint.key(),
            LendingError::UnsupportedToken
        );
        if ctx.accounts.market.active_rewards == Pubkey::default() {
            require_keys_eq!(
                ctx.accounts.market.creator,
                ctx.accounts.funder.key(),
                LendingError::Unauthorized
            );
            ctx.accounts.market.active_rewards = rewards.key();
        } else {
            require_keys_eq!(
                ctx.accounts.market.active_rewards,
                rewards.key(),
                LendingError::MarketMismatch
            );
        }
        transfer_checked(
            CpiContext::new(
                ctx.accounts.reward_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.funder_rewards.to_account_info(),
                    mint: ctx.accounts.reward_mint.to_account_info(),
                    to: ctx.accounts.reward_vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.reward_mint.decimals,
        )?;
        let distributable = amount
            .checked_add(rewards.undistributed_rewards)
            .ok_or(LendingError::MathOverflow)?;
        if ctx.accounts.market.total_supply_shares == 0 {
            rewards.undistributed_rewards = distributable;
        } else {
            let delta = math::mul_div_floor(
                u128::from(distributable),
                RATE_SCALE,
                ctx.accounts.market.total_supply_shares,
            )?;
            rewards.reward_index = rewards
                .reward_index
                .checked_add(delta)
                .ok_or(LendingError::MathOverflow)?;
            rewards.undistributed_rewards = 0;
        }
        emit!(LenderRewardsFunded {
            market: ctx.accounts.market.key(),
            funder: ctx.accounts.funder.key(),
            reward_mint: ctx.accounts.reward_mint.key(),
            amount
        });
        Ok(())
    }

    pub fn claim_lender_rewards(ctx: Context<ClaimLenderRewards>) -> Result<()> {
        let position = &mut ctx.accounts.lender_position;
        let rewards = &ctx.accounts.market_rewards;
        let (amount, checkpoint) = math::settle_rewards(
            position.supply_shares,
            position.reward_index_checkpoint,
            rewards.reward_index,
            position.reward_owed,
        )?;
        require!(amount > 0, LendingError::AmountTooSmall);
        position.reward_index_checkpoint = checkpoint;
        position.reward_owed = 0;
        let market_key = ctx.accounts.market.key();
        let seeds: &[&[u8]] = &[
            b"market-authority",
            market_key.as_ref(),
            &[ctx.accounts.market.authority_bump],
        ];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.reward_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    mint: ctx.accounts.reward_mint.to_account_info(),
                    to: ctx.accounts.lender_rewards.to_account_info(),
                    authority: ctx.accounts.market_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.reward_mint.decimals,
        )?;
        emit!(LenderRewardsClaimed {
            market: market_key,
            lender: ctx.accounts.lender.key(),
            reward_mint: ctx.accounts.reward_mint.key(),
            amount,
        });
        Ok(())
    }
}

fn settle_lender_rewards(
    market: &Market,
    position: &mut LenderPosition,
    rewards: Option<&Account<MarketRewards>>,
) -> Result<()> {
    if market.active_rewards == Pubkey::default() {
        return Ok(());
    }
    let rewards = rewards.ok_or(LendingError::RewardsAccountRequired)?;
    require_keys_eq!(
        rewards.key(),
        market.active_rewards,
        LendingError::MarketMismatch
    );
    require_keys_eq!(
        rewards.market,
        position.market,
        LendingError::MarketMismatch
    );
    let (owed, checkpoint) = math::settle_rewards(
        position.supply_shares,
        position.reward_index_checkpoint,
        rewards.reward_index,
        position.reward_owed,
    )?;
    position.reward_owed = owed;
    position.reward_index_checkpoint = checkpoint;
    Ok(())
}

fn validate_oracle(
    config: &OracleConfiguration,
    observation: &OracleObservation,
    now: i64,
) -> Result<()> {
    require_keys_eq!(
        config.market,
        observation.market,
        LendingError::MarketMismatch
    );
    require!(
        observation.price > 0 && observation.max_recoverable_usdc > 0,
        LendingError::InvalidOracle
    );
    require!(
        observation.confidence_bps <= config.max_confidence_bps
            && observation.deviation_bps <= config.max_deviation_bps,
        LendingError::InvalidOracle
    );
    let age = now
        .checked_sub(observation.published_at)
        .ok_or(LendingError::MathOverflow)?;
    require!(
        age >= 0 && age <= i64::from(config.max_age_seconds),
        LendingError::OracleUnavailable
    );
    Ok(())
}

fn require_healthy(
    collateral: u64,
    decimals: u8,
    debt: u64,
    price: u128,
    price_decimals: u8,
    lltv_bps: u16,
) -> Result<()> {
    if debt == 0 {
        return Ok(());
    }
    let value = math::collateral_value(collateral, decimals, price, price_decimals)?;
    require!(
        debt <= math::max_debt_for_collateral(value, lltv_bps)?,
        LendingError::UnhealthyPosition
    );
    Ok(())
}

fn net_market_assets(market: &Market, cash: u64) -> Result<u128> {
    u128::from(cash)
        .checked_add(market.total_debt)
        .ok_or(LendingError::MathOverflow)?
        .checked_sub(u128::from(market.creator_fees_claimable))
        .ok_or(LendingError::MathOverflow)?
        .checked_sub(u128::from(market.protocol_fees_claimable))
        .ok_or(LendingError::MathOverflow.into())
}

fn accrue_market(market: &mut Market, market_key: Pubkey, cash: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let elapsed = now
        .checked_sub(market.last_accrual_timestamp)
        .ok_or(LendingError::MathOverflow)?;
    if elapsed == 0 || market.total_debt == 0 {
        market.last_accrual_timestamp = now;
        return Ok(());
    }
    let elapsed = u64::try_from(elapsed).map_err(|_| LendingError::MathOverflow)?;
    let utilization = math::utilization(cash, market.total_debt)?;
    let rate = math::borrow_rate(
        utilization,
        market.rate_model.base_rate,
        market.rate_model.target_utilization_bps,
        market.rate_model.slope_low,
        market.rate_model.slope_high,
        market.rate_model.max_borrow_rate,
    )?;
    let new_index = math::accrue_index(market.borrow_index, rate, elapsed)?;
    let new_debt = math::mul_div_ceil(market.total_debt, new_index, market.borrow_index)?;
    let interest = new_debt
        .checked_sub(market.total_debt)
        .ok_or(LendingError::MathOverflow)?;
    let creator_fee = math::mul_div_floor(
        interest,
        u128::from(market.creator_fee_bps),
        u128::from(BPS_DENOMINATOR),
    )?;
    let protocol_fee = math::mul_div_floor(
        interest,
        u128::from(market.protocol_fee_bps),
        u128::from(BPS_DENOMINATOR),
    )?;
    require!(
        creator_fee
            .checked_add(protocol_fee)
            .ok_or(LendingError::MathOverflow)?
            <= interest,
        LendingError::ExcessiveFees
    );
    market.total_debt = new_debt;
    market.borrow_index = new_index;
    market.creator_fees_claimable = market
        .creator_fees_claimable
        .checked_add(u64::try_from(creator_fee).map_err(|_| LendingError::MathOverflow)?)
        .ok_or(LendingError::MathOverflow)?;
    market.protocol_fees_claimable = market
        .protocol_fees_claimable
        .checked_add(u64::try_from(protocol_fee).map_err(|_| LendingError::MathOverflow)?)
        .ok_or(LendingError::MathOverflow)?;
    market.last_accrual_timestamp = now;
    emit!(InterestAccrued {
        market: market_key,
        interest: u64::try_from(interest).map_err(|_| LendingError::MathOverflow)?,
        borrow_index: new_index
    });
    Ok(())
}

fn transfer_from_market_collateral(ctx: &Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    let market_key = ctx.accounts.market.key();
    let seeds: &[&[u8]] = &[
        b"market-authority",
        market_key.as_ref(),
        &[ctx.accounts.market.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.collateral_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.collateral_vault.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.borrower_collateral.to_account_info(),
                authority: ctx.accounts.market_authority.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.collateral_mint.decimals,
    )
}

fn transfer_market_usdc(ctx: &Context<BorrowUsdc>, amount: u64) -> Result<()> {
    let market_key = ctx.accounts.market.key();
    let seeds: &[&[u8]] = &[
        b"market-authority",
        market_key.as_ref(),
        &[ctx.accounts.market.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.loan_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.liquidity_vault.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
                to: ctx.accounts.borrower_usdc.to_account_info(),
                authority: ctx.accounts.market_authority.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.loan_mint.decimals,
    )
}

fn transfer_liquidation_collateral(ctx: &Context<Liquidate>, amount: u64) -> Result<()> {
    let market_key = ctx.accounts.market.key();
    let seeds: &[&[u8]] = &[
        b"market-authority",
        market_key.as_ref(),
        &[ctx.accounts.market.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.collateral_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.collateral_vault.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.liquidator_collateral.to_account_info(),
                authority: ctx.accounts.market_authority.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.collateral_mint.decimals,
    )
}

fn transfer_reserve_to_liquidity(ctx: &Context<Liquidate>, amount: u64) -> Result<()> {
    let market_key = ctx.accounts.market.key();
    let seeds: &[&[u8]] = &[
        b"market-authority",
        market_key.as_ref(),
        &[ctx.accounts.market.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.loan_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.reserve_vault.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
                to: ctx.accounts.liquidity_vault.to_account_info(),
                authority: ctx.accounts.market_authority.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.loan_mint.decimals,
    )
}

fn validate_market_args(ctx: &Context<CreateMarket>, args: &CreateMarketArgs) -> Result<()> {
    require!(!ctx.accounts.global_config.paused, LendingError::Paused);
    require_keys_eq!(
        ctx.accounts.loan_mint.key(),
        ctx.accounts.global_config.approved_loan_mint,
        LendingError::UnsupportedToken
    );
    require!(
        approved_oracle_kind(args.oracle_kind),
        LendingError::InvalidOracle
    );
    validate_token_extensions(&ctx.accounts.collateral_mint.to_account_info())?;
    validate_token_extensions(&ctx.accounts.loan_mint.to_account_info())?;
    require!(
        ALLOWED_LLTV_BPS.contains(&args.lltv_bps),
        LendingError::InvalidParameter
    );
    require!(
        args.liquidation_bonus_bps <= MAX_LIQUIDATION_BONUS_BPS,
        LendingError::InvalidParameter
    );
    require!(
        args.close_factor_bps > 0 && u64::from(args.close_factor_bps) <= BPS_DENOMINATOR,
        LendingError::InvalidParameter
    );
    let fees = args
        .creator_fee_bps
        .checked_add(args.protocol_fee_bps)
        .ok_or(LendingError::MathOverflow)?;
    require!(fees <= MAX_TOTAL_FEE_BPS, LendingError::InvalidParameter);
    require!(
        args.rate_model.target_utilization_bps > 0
            && u64::from(args.rate_model.target_utilization_bps) < BPS_DENOMINATOR,
        LendingError::InvalidParameter
    );
    require!(
        args.rate_model.max_borrow_rate >= args.rate_model.base_rate,
        LendingError::InvalidParameter
    );
    require!(
        approved_rate_model(&args.rate_model),
        LendingError::InvalidParameter
    );
    require!(
        args.market_borrow_cap > 0 && args.wallet_borrow_cap > 0,
        LendingError::InvalidParameter
    );
    require!(
        args.oracle_max_age_seconds > 0
            && args.oracle_max_age_seconds <= ctx.accounts.global_config.max_oracle_age_seconds,
        LendingError::InvalidParameter
    );
    require!(
        !args.oracle_sources.is_empty() && args.oracle_sources.len() <= MAX_ORACLE_SOURCES,
        LendingError::InvalidOracle
    );
    require!(
        args.oracle_price_decimals <= MAX_TOKEN_DECIMALS,
        LendingError::InvalidOracle
    );
    let mut canonical_args = args.clone();
    canonical_args.config_hash = [0; 32];
    let encoded_args = canonical_args.try_to_vec()?;
    let collateral_mint = ctx.accounts.collateral_mint.key();
    let loan_mint = ctx.accounts.loan_mint.key();
    let collateral_token_program = ctx.accounts.collateral_token_program.key();
    let loan_token_program = ctx.accounts.loan_token_program.key();
    let expected_hash = hashv(&[
        b"meme-lend-market-v1",
        ctx.accounts.creator.key().as_ref(),
        collateral_mint.as_ref(),
        loan_mint.as_ref(),
        collateral_token_program.as_ref(),
        loan_token_program.as_ref(),
        encoded_args.as_slice(),
    ])
    .to_bytes();
    require!(
        args.config_hash == expected_hash,
        LendingError::InvalidConfigHash
    );
    Ok(())
}

fn approved_rate_model(model: &InterestRateModel) -> bool {
    let standard = model.base_rate == STANDARD_BASE_RATE
        && model.target_utilization_bps == STANDARD_TARGET_UTILIZATION_BPS
        && model.slope_low == STANDARD_SLOPE_LOW
        && model.slope_high == STANDARD_SLOPE_HIGH
        && model.max_borrow_rate == STANDARD_MAX_RATE;
    let conservative = model.base_rate == CONSERVATIVE_BASE_RATE
        && model.target_utilization_bps == CONSERVATIVE_TARGET_UTILIZATION_BPS
        && model.slope_low == CONSERVATIVE_SLOPE_LOW
        && model.slope_high == CONSERVATIVE_SLOPE_HIGH
        && model.max_borrow_rate == CONSERVATIVE_MAX_RATE;
    standard || conservative
}

fn approved_oracle_kind(kind: OracleKind) -> bool {
    kind == OracleKind::Custom
}

fn validate_token_extensions(mint: &AccountInfo) -> Result<()> {
    if mint.owner != &spl_token_2022::id() {
        return Ok(());
    }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&data)
        .map_err(|_| LendingError::UnsupportedToken)?;
    let extensions = state
        .get_extension_types()
        .map_err(|_| LendingError::UnsupportedToken)?;
    require!(
        extensions.iter().all(|extension| matches!(
            extension,
            ExtensionType::MetadataPointer
                | ExtensionType::TokenMetadata
                | ExtensionType::GroupPointer
                | ExtensionType::TokenGroup
                | ExtensionType::GroupMemberPointer
                | ExtensionType::TokenGroupMember
        )),
        LendingError::UnsupportedTokenExtension
    );
    Ok(())
}

#[cfg(test)]
mod validation_tests {
    use super::*;

    #[test]
    fn only_reviewed_interest_curves_are_accepted() {
        let approved = InterestRateModel {
            base_rate: STANDARD_BASE_RATE,
            target_utilization_bps: STANDARD_TARGET_UTILIZATION_BPS,
            slope_low: STANDARD_SLOPE_LOW,
            slope_high: STANDARD_SLOPE_HIGH,
            max_borrow_rate: STANDARD_MAX_RATE,
        };
        assert!(approved_rate_model(&approved));
        let mut altered = approved;
        altered.slope_high += 1;
        assert!(!approved_rate_model(&altered));
    }

    #[test]
    fn unavailable_native_adapters_cannot_be_mislabeled_as_live() {
        assert!(approved_oracle_kind(OracleKind::Custom));
        assert!(!approved_oracle_kind(OracleKind::Pyth));
        assert!(!approved_oracle_kind(OracleKind::Switchboard));
        assert!(!approved_oracle_kind(OracleKind::DexTwap));
        assert!(!approved_oracle_kind(OracleKind::AggregatedPools));
    }
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub program: Program<'info, crate::program::MemeLending>,
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key()) @ LendingError::Unauthorized,
        constraint = program_data.upgrade_authority_address == Some(authority.key()) @ LendingError::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,
    pub loan_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: Stored as a destination authority and need not sign initialization.
    pub protocol_fee_recipient: UncheckedAccount<'info>,
    #[account(init, payer = authority, space = 8 + GlobalConfig::INIT_SPACE, seeds = [b"global-config"], bump)]
    pub global_config: Account<'info, GlobalConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetProtocolPause<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"global-config"], bump = global_config.bump, has_one = authority)]
    pub global_config: Account<'info, GlobalConfig>,
}

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [b"global-config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = global_config.approved_loan_mint)]
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: PDA signs only for vaults derived below.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(init, payer = creator, space = 8 + Market::INIT_SPACE, seeds = [b"market", args.config_hash.as_ref()], bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(init, payer = creator, space = 8 + OracleConfiguration::INIT_SPACE, seeds = [b"oracle", market.key().as_ref()], bump)]
    pub oracle_configuration: Box<Account<'info, OracleConfiguration>>,
    #[account(init, payer = creator, space = 8 + FirstLossReserve::INIT_SPACE, seeds = [b"reserve", market.key().as_ref()], bump)]
    pub first_loss_reserve: Box<Account<'info, FirstLossReserve>>,
    #[account(init, payer = creator, associated_token::mint = loan_mint, associated_token::authority = market_authority, associated_token::token_program = loan_token_program)]
    pub liquidity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init, payer = creator, associated_token::mint = collateral_mint, associated_token::authority = market_authority, associated_token::token_program = collateral_token_program)]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init, payer = creator, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program, seeds = [b"reserve-vault", market.key().as_ref()], bump)]
    pub reserve_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub loan_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseMarket<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"global-config"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut, has_one = global_config)]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct AccrueInterest<'info> {
    #[account(mut, has_one = liquidity_vault)]
    pub market: Account<'info, Market>,
    #[account(token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = market.loan_mint)]
    pub loan_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SupplyUsdc<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,
    #[account(mut, has_one = liquidity_vault)]
    pub market: Account<'info, Market>,
    #[account(init_if_needed, payer = lender, space = 8 + LenderPosition::INIT_SPACE, seeds = [b"lender", market.key().as_ref(), lender.key().as_ref()], bump)]
    pub lender_position: Account<'info, LenderPosition>,
    pub market_rewards: Option<Account<'info, MarketRewards>>,
    #[account(address = market.loan_mint)]
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = loan_mint, token::authority = lender, token::token_program = loan_token_program)]
    pub lender_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawUsdc<'info> {
    pub lender: Signer<'info>,
    #[account(mut, has_one = liquidity_vault)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"lender", market.key().as_ref(), lender.key().as_ref()], bump = lender_position.bump, has_one = market, constraint = lender_position.owner == lender.key() @ LendingError::Unauthorized)]
    pub lender_position: Account<'info, LenderPosition>,
    pub market_rewards: Option<Account<'info, MarketRewards>>,
    #[account(address = market.loan_mint)]
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = loan_mint, token::authority = lender, token::token_program = loan_token_program)]
    pub lender_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SubmitOracleObservation<'info> {
    #[account(mut)]
    pub publisher: Signer<'info>,
    pub market: Account<'info, Market>,
    #[account(has_one = market, address = market.oracle_configuration)]
    pub oracle_configuration: Account<'info, OracleConfiguration>,
    #[account(init_if_needed, payer = publisher, space = 8 + OracleObservation::INIT_SPACE, seeds = [b"observation", market.key().as_ref()], bump)]
    pub oracle_observation: Account<'info, OracleObservation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(has_one = collateral_vault)]
    pub market: Account<'info, Market>,
    #[account(init_if_needed, payer = borrower, space = 8 + BorrowerPosition::INIT_SPACE, seeds = [b"borrower", market.key().as_ref(), borrower.key().as_ref()], bump)]
    pub borrower_position: Account<'info, BorrowerPosition>,
    #[account(address = market.collateral_mint)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = collateral_mint, token::authority = borrower, token::token_program = collateral_token_program)]
    pub borrower_collateral: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = collateral_mint, token::authority = market_authority, token::token_program = collateral_token_program)]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.collateral_token_program)]
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    pub borrower: Signer<'info>,
    #[account(has_one = collateral_vault, has_one = oracle_configuration)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"borrower", market.key().as_ref(), borrower.key().as_ref()], bump = borrower_position.bump, has_one = market, constraint = borrower_position.owner == borrower.key() @ LendingError::Unauthorized)]
    pub borrower_position: Account<'info, BorrowerPosition>,
    pub oracle_configuration: Account<'info, OracleConfiguration>,
    #[account(seeds = [b"observation", market.key().as_ref()], bump = oracle_observation.bump, has_one = market)]
    pub oracle_observation: Account<'info, OracleObservation>,
    #[account(address = market.collateral_mint)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = collateral_mint, token::authority = borrower, token::token_program = collateral_token_program)]
    pub borrower_collateral: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = collateral_mint, token::authority = market_authority, token::token_program = collateral_token_program)]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.collateral_token_program)]
    pub collateral_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct BorrowUsdc<'info> {
    pub borrower: Signer<'info>,
    #[account(seeds = [b"global-config"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut, has_one = liquidity_vault, has_one = oracle_configuration)]
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"borrower", market.key().as_ref(), borrower.key().as_ref()], bump = borrower_position.bump, has_one = market, constraint = borrower_position.owner == borrower.key() @ LendingError::Unauthorized)]
    pub borrower_position: Account<'info, BorrowerPosition>,
    pub oracle_configuration: Account<'info, OracleConfiguration>,
    #[account(seeds = [b"observation", market.key().as_ref()], bump = oracle_observation.bump, has_one = market)]
    pub oracle_observation: Account<'info, OracleObservation>,
    #[account(address = market.collateral_mint)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(address = market.loan_mint)]
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = loan_mint, token::authority = borrower, token::token_program = loan_token_program)]
    pub borrower_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RepayUsdc<'info> {
    pub payer: Signer<'info>,
    #[account(mut, has_one = liquidity_vault)]
    pub market: Account<'info, Market>,
    #[account(mut, has_one = market)]
    pub borrower_position: Account<'info, BorrowerPosition>,
    #[account(address = market.loan_mint)]
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = loan_mint, token::authority = payer, token::token_program = loan_token_program)]
    pub payer_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct DepositFirstLossReserve<'info> {
    pub contributor: Signer<'info>,
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"reserve", market.key().as_ref()], bump = first_loss_reserve.bump, has_one = market)]
    pub first_loss_reserve: Account<'info, FirstLossReserve>,
    #[account(address = market.loan_mint)]
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = loan_mint, token::authority = contributor, token::token_program = loan_token_program)]
    pub contributor_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = first_loss_reserve.vault, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub reserve_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimCreatorFees<'info> {
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator, has_one = liquidity_vault)]
    pub market: Account<'info, Market>,
    #[account(address = market.loan_mint)]
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = loan_mint, token::authority = creator, token::token_program = loan_token_program)]
    pub creator_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimProtocolFees<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = authority, has_one = protocol_fee_recipient)]
    pub global_config: Account<'info, GlobalConfig>,
    /// CHECK: Constrained to the immutable protocol recipient in global_config.
    pub protocol_fee_recipient: UncheckedAccount<'info>,
    #[account(mut, has_one = global_config, has_one = liquidity_vault)]
    pub market: Account<'info, Market>,
    #[account(address = market.loan_mint)]
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = loan_mint, token::authority = protocol_fee_recipient, token::token_program = loan_token_program)]
    pub recipient_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub liquidity_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    pub liquidator: Signer<'info>,
    #[account(mut, has_one = liquidity_vault, has_one = collateral_vault, has_one = oracle_configuration)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market)]
    pub borrower_position: Box<Account<'info, BorrowerPosition>>,
    pub oracle_configuration: Box<Account<'info, OracleConfiguration>>,
    #[account(seeds = [b"observation", market.key().as_ref()], bump = oracle_observation.bump, has_one = market)]
    pub oracle_observation: Box<Account<'info, OracleObservation>>,
    #[account(mut, seeds = [b"reserve", market.key().as_ref()], bump = first_loss_reserve.bump, has_one = market)]
    pub first_loss_reserve: Box<Account<'info, FirstLossReserve>>,
    #[account(address = market.loan_mint)]
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = market.collateral_mint)]
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = loan_mint, token::authority = liquidator, token::token_program = loan_token_program)]
    pub liquidator_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = liquidator, token::token_program = collateral_token_program)]
    pub liquidator_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub liquidity_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = market_authority, token::token_program = collateral_token_program)]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = first_loss_reserve.vault, token::mint = loan_mint, token::authority = market_authority, token::token_program = loan_token_program)]
    pub reserve_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    #[account(address = market.loan_token_program)]
    pub loan_token_program: Interface<'info, TokenInterface>,
    #[account(address = market.collateral_token_program)]
    pub collateral_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct FundLenderRewards<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    pub reward_mint: InterfaceAccount<'info, Mint>,
    #[account(init_if_needed, payer = funder, space = 8 + MarketRewards::INIT_SPACE, seeds = [b"rewards", market.key().as_ref(), reward_mint.key().as_ref()], bump)]
    pub market_rewards: Account<'info, MarketRewards>,
    #[account(init_if_needed, payer = funder, token::mint = reward_mint, token::authority = market_authority, token::token_program = reward_token_program, seeds = [b"reward-vault", market.key().as_ref(), reward_mint.key().as_ref()], bump)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = reward_mint, token::authority = funder, token::token_program = reward_token_program)]
    pub funder_rewards: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    pub reward_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimLenderRewards<'info> {
    pub lender: Signer<'info>,
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"lender", market.key().as_ref(), lender.key().as_ref()], bump = lender_position.bump, has_one = market, constraint = lender_position.owner == lender.key() @ LendingError::Unauthorized)]
    pub lender_position: Account<'info, LenderPosition>,
    #[account(seeds = [b"rewards", market.key().as_ref(), reward_mint.key().as_ref()], bump = market_rewards.bump, has_one = market, has_one = reward_mint, has_one = reward_vault)]
    pub market_rewards: Account<'info, MarketRewards>,
    pub reward_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = reward_mint, token::authority = lender, token::token_program = reward_token_program)]
    pub lender_rewards: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = reward_mint, token::authority = market_authority, token::token_program = reward_token_program)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Canonical market authority PDA.
    #[account(seeds = [b"market-authority", market.key().as_ref()], bump = market.authority_bump)]
    pub market_authority: UncheckedAccount<'info>,
    pub reward_token_program: Interface<'info, TokenInterface>,
}
