import { AnchorProvider, BN, BorshInstructionCoder, type Wallet } from "@coral-xyz/anchor";
import {
  borrowerPositionPda,
  createMemeLendProgram,
  lenderPositionPda,
  marketAuthorityPda,
  marketPda,
  MEME_LEND_IDL,
} from "@meme-lend/sdk";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, type Connection, type Transaction } from "@solana/web3.js";

export type MarketAction =
  "Supply" | "Withdraw" | "Deposit collateral" | "Borrow" | "Repay" | "Liquidate";

export const RATE_MODELS = {
  standard: {
    baseRate: "20000000000000000",
    targetUtilizationBps: 8000,
    slopeLow: "180000000000000000",
    slopeHigh: "2000000000000000000",
    maxBorrowRate: "2200000000000000000",
  },
  conservative: {
    baseRate: "50000000000000000",
    targetUtilizationBps: 7000,
    slopeLow: "250000000000000000",
    slopeHigh: "3000000000000000000",
    maxBorrowRate: "3300000000000000000",
  },
} as const;

const concatenate = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

function parseUnits(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a positive decimal amount");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new Error(`This token supports at most ${decimals} decimal places`);
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n) throw new Error("Amount is too small");
  return units;
}

export async function buildCreateMarketTransaction(input: {
  collateralMint: string;
  oraclePublisher: string;
  lltvBps: 5000 | 6500 | 7500;
  rateModel: keyof typeof RATE_MODELS;
  marketBorrowCap: string;
  walletBorrowCap: string;
  owner: PublicKey;
  connection: Connection;
  wallet: Wallet;
}): Promise<{ transaction: Transaction; market: PublicKey }> {
  const provider = new AnchorProvider(input.connection, input.wallet, { commitment: "confirmed" });
  const program = createMemeLendProgram(provider);
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global-config")],
    program.programId,
  );
  const global = (await program.account.globalConfig.fetch(globalConfig)) as unknown as {
    approvedLoanMint: PublicKey;
    maxOracleAgeSeconds: number;
  };
  const collateralMint = new PublicKey(input.collateralMint);
  const loanMint = global.approvedLoanMint;
  const [collateralInfo, loanInfo] = await Promise.all([
    input.connection.getAccountInfo(collateralMint, "confirmed"),
    input.connection.getAccountInfo(loanMint, "confirmed"),
  ]);
  if (!collateralInfo || !loanInfo)
    throw new Error("Collateral or approved loan mint does not exist");
  const collateralTokenProgram = collateralInfo.owner;
  const loanTokenProgram = loanInfo.owner;
  const loanDecimals = (await getMint(input.connection, loanMint, "confirmed", loanTokenProgram))
    .decimals;
  const rate = RATE_MODELS[input.rateModel];
  const args: Record<string, unknown> = {
    configHash: Array(32).fill(0),
    lltvBps: input.lltvBps,
    liquidationBonusBps: 1000,
    closeFactorBps: 5000,
    creatorFeeBps: 1000,
    protocolFeeBps: 500,
    rateModel: {
      baseRate: new BN(rate.baseRate),
      targetUtilizationBps: rate.targetUtilizationBps,
      slopeLow: new BN(rate.slopeLow),
      slopeHigh: new BN(rate.slopeHigh),
      maxBorrowRate: new BN(rate.maxBorrowRate),
    },
    marketBorrowCap: new BN(parseUnits(input.marketBorrowCap, loanDecimals).toString()),
    walletBorrowCap: new BN(parseUnits(input.walletBorrowCap, loanDecimals).toString()),
    oracleKind: { custom: {} },
    oracleMaxAgeSeconds: Math.min(global.maxOracleAgeSeconds, 60),
    oracleMaxConfidenceBps: 500,
    oracleMaxDeviationBps: 1000,
    oraclePriceDecimals: 18,
    oracleSources: [new PublicKey(input.oraclePublisher)],
  };
  const encodedInstruction = new BorshInstructionCoder(MEME_LEND_IDL).encode("create_market", {
    args,
  });
  if (!encodedInstruction) throw new Error("Could not serialize immutable market configuration");
  const configHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      concatenate(
        new TextEncoder().encode("meme-lend-market-v1"),
        input.owner.toBytes(),
        collateralMint.toBytes(),
        loanMint.toBytes(),
        collateralTokenProgram.toBytes(),
        loanTokenProgram.toBytes(),
        encodedInstruction.subarray(8),
      ),
    ),
  );
  args.configHash = [...configHash];
  const [market] = marketPda(program.programId, configHash);
  const [marketAuthority] = marketAuthorityPda(program.programId, market);
  const [oracleConfiguration] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle"), market.toBuffer()],
    program.programId,
  );
  const [firstLossReserve] = PublicKey.findProgramAddressSync(
    [Buffer.from("reserve"), market.toBuffer()],
    program.programId,
  );
  const [reserveVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("reserve-vault"), market.toBuffer()],
    program.programId,
  );
  const liquidityVault = getAssociatedTokenAddressSync(
    loanMint,
    marketAuthority,
    true,
    loanTokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const collateralVault = getAssociatedTokenAddressSync(
    collateralMint,
    marketAuthority,
    true,
    collateralTokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const transaction = await program.methods
    .createMarket(args as never)
    .accountsPartial({
      creator: input.owner,
      globalConfig,
      collateralMint,
      loanMint,
      marketAuthority,
      market,
      oracleConfiguration,
      firstLossReserve,
      liquidityVault,
      collateralVault,
      reserveVault,
      collateralTokenProgram,
      loanTokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  return { transaction, market };
}

export async function buildMarketTransaction(input: {
  action: MarketAction;
  amount: string;
  market: string;
  owner: PublicKey;
  connection: Connection;
  wallet: Wallet;
  borrower?: string;
}): Promise<Transaction> {
  const provider = new AnchorProvider(input.connection, input.wallet, { commitment: "confirmed" });
  const program = createMemeLendProgram(provider);
  const market = new PublicKey(input.market);
  const account = (await program.account.market.fetch(market)) as unknown as Record<
    string,
    PublicKey
  >;
  const loanMint = new PublicKey(account.loanMint);
  const collateralMint = new PublicKey(account.collateralMint);
  const loanTokenProgram = new PublicKey(account.loanTokenProgram);
  const collateralTokenProgram = new PublicKey(account.collateralTokenProgram);
  const [authority] = marketAuthorityPda(program.programId, market);
  const ownerLoan = getAssociatedTokenAddressSync(
    loanMint,
    input.owner,
    false,
    loanTokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const ownerCollateral = getAssociatedTokenAddressSync(
    collateralMint,
    input.owner,
    false,
    collateralTokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const [lenderPosition] = lenderPositionPda(program.programId, market, input.owner);
  const borrowerOwner = input.borrower ? new PublicKey(input.borrower) : input.owner;
  const [borrowerPosition] = borrowerPositionPda(program.programId, market, borrowerOwner);
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global-config")],
    program.programId,
  );
  const [observation] = PublicKey.findProgramAddressSync(
    [Buffer.from("observation"), market.toBuffer()],
    program.programId,
  );
  const [reserve] = PublicKey.findProgramAddressSync(
    [Buffer.from("reserve"), market.toBuffer()],
    program.programId,
  );
  const common = { market, marketAuthority: authority };
  type Builder = {
    accountsPartial(accounts: Record<string, unknown>): { transaction(): Promise<Transaction> };
  };
  const methods = program.methods as unknown as Record<string, (...args: unknown[]) => Builder>;
  const amountMint = input.action === "Deposit collateral" ? collateralMint : loanMint;
  const amountProgram =
    input.action === "Deposit collateral" ? collateralTokenProgram : loanTokenProgram;
  const decimals =
    input.action === "Withdraw"
      ? 0
      : (await getMint(input.connection, amountMint, "confirmed", amountProgram)).decimals;
  const amount = new BN(parseUnits(input.amount, decimals).toString());
  if (input.action === "Supply")
    return methods
      .supplyUsdc(amount)
      .accountsPartial({
        lender: input.owner,
        ...common,
        lenderPosition,
        marketRewards: null,
        loanMint,
        lenderUsdc: ownerLoan,
        liquidityVault: account.liquidityVault,
        loanTokenProgram,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
  if (input.action === "Withdraw")
    return methods
      .withdrawUsdc(amount)
      .accountsPartial({
        lender: input.owner,
        ...common,
        lenderPosition,
        marketRewards: null,
        loanMint,
        lenderUsdc: ownerLoan,
        liquidityVault: account.liquidityVault,
        loanTokenProgram,
      })
      .transaction();
  if (input.action === "Deposit collateral")
    return methods
      .depositCollateral(amount)
      .accountsPartial({
        borrower: input.owner,
        ...common,
        borrowerPosition,
        collateralMint,
        borrowerCollateral: ownerCollateral,
        collateralVault: account.collateralVault,
        collateralTokenProgram,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
  if (input.action === "Borrow")
    return methods
      .borrowUsdc(amount)
      .accountsPartial({
        borrower: input.owner,
        globalConfig,
        ...common,
        borrowerPosition,
        oracleConfiguration: account.oracleConfiguration,
        oracleObservation: observation,
        collateralMint,
        loanMint,
        borrowerUsdc: ownerLoan,
        liquidityVault: account.liquidityVault,
        loanTokenProgram,
      })
      .transaction();
  if (input.action === "Repay")
    return methods
      .repayUsdc(amount)
      .accountsPartial({
        payer: input.owner,
        ...common,
        borrowerPosition,
        loanMint,
        payerUsdc: ownerLoan,
        liquidityVault: account.liquidityVault,
        loanTokenProgram,
      })
      .transaction();
  return methods
    .liquidate(amount)
    .accountsPartial({
      liquidator: input.owner,
      ...common,
      borrowerPosition,
      oracleConfiguration: account.oracleConfiguration,
      oracleObservation: observation,
      firstLossReserve: reserve,
      loanMint,
      collateralMint,
      liquidatorUsdc: ownerLoan,
      liquidatorCollateral: ownerCollateral,
      liquidityVault: account.liquidityVault,
      collateralVault: account.collateralVault,
      reserveVault: account.reserveVault,
      loanTokenProgram,
      collateralTokenProgram,
    })
    .transaction();
}
