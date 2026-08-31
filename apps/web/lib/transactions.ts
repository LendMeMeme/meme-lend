import {
  decodePinocchioGlobalConfig,
  decodePinocchioMarket,
  encodeCreatePinocchioMarket,
  associatedTokenAddress,
  associatedTokenAddressWithBump,
  createAssociatedTokenAccountIdempotentInstruction,
  getMintDecimals,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  PINOCCHIO_PROGRAM_ID,
  PINOCCHIO_TAG,
  pinocchioAmount,
  pinocchioInstruction,
  pinocchioPdas,
  pinocchioShares,
} from "@meme-lend/sdk";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type AccountMeta,
  type Connection,
} from "@solana/web3.js";

export type MarketAction =
  "Supply" | "Withdraw" | "Deposit collateral" | "Borrow" | "Repay" | "Liquidate";
export const RATE_MODELS = { standard: { id: 0 }, conservative: { id: 1 } } as const;
const id = () => new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID ?? PINOCCHIO_PROGRAM_ID);
const m = (pubkey: PublicKey, isWritable = false, isSigner = false): AccountMeta => ({
  pubkey,
  isWritable,
  isSigner,
});

function parseUnits(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a positive decimal amount");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new Error(`This token supports at most ${decimals} decimal places`);
  const result =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (result <= 0n) throw new Error("Amount is too small");
  return result;
}

async function data(connection: Connection, key: PublicKey): Promise<Uint8Array> {
  const account = await connection.getAccountInfo(key, "confirmed");
  if (!account) throw new Error(`Required on-chain account is missing: ${key.toBase58()}`);
  return account.data;
}

export async function buildCreateMarketTransaction(input: {
  collateralMint: string;
  oraclePublisher: string;
  lltvBps: 3000 | 4000 | 5000 | 6000 | 6500;
  rateModel: keyof typeof RATE_MODELS;
  marketBorrowCap: string;
  walletBorrowCap: string;
  owner: PublicKey;
  connection: Connection;
}): Promise<{ transaction: Transaction; market: PublicKey }> {
  const programId = id();
  const [globalConfig] = pinocchioPdas.globalConfig(programId);
  const global = decodePinocchioGlobalConfig(await data(input.connection, globalConfig));
  if (global.paused) throw new Error("Protocol market creation is paused");
  const collateralMint = new PublicKey(input.collateralMint);
  const loanMint = global.approvedLoanMint;
  const [ci, li] = await Promise.all([
    input.connection.getAccountInfo(collateralMint),
    input.connection.getAccountInfo(loanMint),
  ]);
  if (!ci || !li) throw new Error("Collateral or approved loan mint does not exist");
  const collateralTokenProgram = ci.owner,
    loanTokenProgram = li.owner;
  for (const token of [collateralTokenProgram, loanTokenProgram])
    if (!token.equals(TOKEN_PROGRAM_ID) && !token.equals(TOKEN_2022_PROGRAM_ID))
      throw new Error("Unsupported token program");
  const decimals = await getMintDecimals(input.connection, loanMint, loanTokenProgram);
  const config = {
    lltvBps: input.lltvBps,
    liquidationBonusBps: 1000,
    closeFactorBps: 5000,
    creatorFeeBps: 1000,
    protocolFeeBps: 500,
    rateModelId: RATE_MODELS[input.rateModel].id,
    marketBorrowCap: parseUnits(input.marketBorrowCap, decimals),
    walletBorrowCap: parseUnits(input.walletBorrowCap, decimals),
    oracleMaxAgeSeconds: Math.min(global.maxOracleAgeSeconds, 60),
    oracleMaxConfidenceBps: 500,
    oracleMaxDeviationBps: 1000,
    oraclePriceDecimals: 18,
    oracleSources: [new PublicKey(input.oraclePublisher)],
  } as const;
  const initial = await encodeCreatePinocchioMarket({
    creator: input.owner,
    collateralMint,
    loanMint,
    collateralTokenProgram,
    loanTokenProgram,
    config,
    bumps: [0, 0, 0, 0, 0, 0, 0],
  });
  const [market, mb] = pinocchioPdas.market(initial.configHash, programId);
  const [authority, ab] = pinocchioPdas.marketAuthority(market, programId);
  const [oracle, ob] = pinocchioPdas.oracleConfig(market, programId);
  const [reserve, rb] = pinocchioPdas.reserve(market, programId);
  const [reserveVault, rvb] = pinocchioPdas.reserveVault(market, programId);
  const [liquidityVault, lvb] = associatedTokenAddressWithBump(
    loanMint,
    authority,
    loanTokenProgram,
  );
  const [collateralVault, cvb] = associatedTokenAddressWithBump(
    collateralMint,
    authority,
    collateralTokenProgram,
  );
  const encoded = await encodeCreatePinocchioMarket({
    creator: input.owner,
    collateralMint,
    loanMint,
    collateralTokenProgram,
    loanTokenProgram,
    config,
    bumps: [mb, ab, ob, rb, lvb, cvb, rvb],
  });
  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      input.owner,
      liquidityVault,
      authority,
      loanMint,
      loanTokenProgram,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      input.owner,
      collateralVault,
      authority,
      collateralMint,
      collateralTokenProgram,
    ),
    pinocchioInstruction(
      PINOCCHIO_TAG.createMarket,
      [
        m(input.owner, true, true),
        m(globalConfig, true),
        m(collateralMint),
        m(loanMint),
        m(authority),
        m(market, true),
        m(oracle, true),
        m(reserve, true),
        m(liquidityVault),
        m(collateralVault),
        m(reserveVault, true),
        m(collateralTokenProgram),
        m(loanTokenProgram),
        m(SystemProgram.programId),
      ],
      encoded.data,
      programId,
    ),
  );
  return { transaction, market };
}

export async function buildMarketTransaction(input: {
  action: MarketAction;
  amount: string;
  market: string;
  owner: PublicKey;
  connection: Connection;
  borrower?: string;
}): Promise<Transaction> {
  const programId = id(),
    marketKey = new PublicKey(input.market);
  const market = decodePinocchioMarket(await data(input.connection, marketKey));
  const loanProgram = market.loanToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const collateralProgram = market.collateralToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const [authority] = pinocchioPdas.marketAuthority(marketKey, programId);
  const liquidity = associatedTokenAddress(market.loanMint, authority, loanProgram);
  const collateralVault = associatedTokenAddress(
    market.collateralMint,
    authority,
    collateralProgram,
  );
  const ownerLoan = associatedTokenAddress(market.loanMint, input.owner, loanProgram);
  const ownerCollateral = associatedTokenAddress(
    market.collateralMint,
    input.owner,
    collateralProgram,
  );
  const [lender, lenderBump] = pinocchioPdas.lenderPosition(marketKey, input.owner, programId);
  const borrowerOwner = input.borrower ? new PublicKey(input.borrower) : input.owner;
  const [borrower, borrowerBump] = pinocchioPdas.borrowerPosition(
    marketKey,
    borrowerOwner,
    programId,
  );
  const [global] = pinocchioPdas.globalConfig(programId),
    [oracle] = pinocchioPdas.oracleConfig(marketKey, programId);
  const [observation] = pinocchioPdas.oracleObservation(marketKey, programId),
    [reserve] = pinocchioPdas.reserve(marketKey, programId);
  const [reserveVault] = pinocchioPdas.reserveVault(marketKey, programId),
    [rewards] = pinocchioPdas.rewards(marketKey, programId);
  const mint = input.action === "Deposit collateral" ? market.collateralMint : market.loanMint;
  const tokenProgram = input.action === "Deposit collateral" ? collateralProgram : loanProgram;
  const decimals =
    input.action === "Withdraw" ? 0 : await getMintDecimals(input.connection, mint, tokenProgram);
  const amount = parseUnits(input.amount, decimals),
    tx = new Transaction();
  if (input.action === "Supply") {
    const keys = [
      m(input.owner, true, true),
      m(marketKey, true),
      m(lender, true),
      m(ownerLoan, true),
      m(liquidity, true),
      m(market.loanMint),
      m(authority),
      m(loanProgram),
    ];
    if (market.rewardsEnabled) keys.push(m(rewards));
    keys.push(m(SystemProgram.programId));
    return tx.add(
      pinocchioInstruction(
        PINOCCHIO_TAG.supplyUsdc,
        keys,
        Buffer.concat([Buffer.from(pinocchioAmount(amount)), Buffer.from([lenderBump])]),
        programId,
      ),
    );
  }
  if (input.action === "Withdraw") {
    const keys = [
      m(input.owner, false, true),
      m(marketKey, true),
      m(lender, true),
      m(ownerLoan, true),
      m(liquidity, true),
      m(market.loanMint),
      m(authority),
      m(loanProgram),
    ];
    if (market.rewardsEnabled) keys.push(m(rewards));
    return tx.add(
      pinocchioInstruction(PINOCCHIO_TAG.withdrawUsdc, keys, pinocchioShares(amount), programId),
    );
  }
  if (input.action === "Deposit collateral")
    return tx.add(
      pinocchioInstruction(
        PINOCCHIO_TAG.depositCollateral,
        [
          m(input.owner, true, true),
          m(marketKey),
          m(borrower, true),
          m(ownerCollateral, true),
          m(collateralVault, true),
          m(market.collateralMint),
          m(authority),
          m(collateralProgram),
          m(SystemProgram.programId),
        ],
        Buffer.concat([Buffer.from(pinocchioAmount(amount)), Buffer.from([borrowerBump])]),
        programId,
      ),
    );
  if (input.action === "Borrow")
    return tx.add(
      pinocchioInstruction(
        PINOCCHIO_TAG.borrowUsdc,
        [
          m(input.owner, false, true),
          m(global),
          m(marketKey, true),
          m(borrower, true),
          m(ownerLoan, true),
          m(liquidity, true),
          m(market.loanMint),
          m(market.collateralMint),
          m(authority),
          m(loanProgram),
          m(collateralProgram),
          m(oracle),
          m(observation),
        ],
        pinocchioAmount(amount),
        programId,
      ),
    );
  if (input.action === "Repay")
    return tx.add(
      pinocchioInstruction(
        PINOCCHIO_TAG.repayUsdc,
        [
          m(input.owner, false, true),
          m(marketKey, true),
          m(borrower, true),
          m(ownerLoan, true),
          m(liquidity, true),
          m(market.loanMint),
          m(authority),
          m(loanProgram),
        ],
        pinocchioAmount(amount),
        programId,
      ),
    );
  return tx.add(
    pinocchioInstruction(
      PINOCCHIO_TAG.liquidate,
      [
        m(input.owner, false, true),
        m(marketKey, true),
        m(borrower, true),
        m(ownerLoan, true),
        m(ownerCollateral, true),
        m(liquidity, true),
        m(collateralVault, true),
        m(reserve, true),
        m(reserveVault, true),
        m(market.loanMint),
        m(market.collateralMint),
        m(authority),
        m(loanProgram),
        m(collateralProgram),
        m(oracle),
        m(observation),
      ],
      pinocchioAmount(amount),
      programId,
    ),
  );
}
