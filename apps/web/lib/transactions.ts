import {
  decodePinocchioGlobalConfig,
  decodePinocchioMarket,
  decodePinocchioBorrowerPosition,
  decodePinocchioOracleConfiguration,
  decodePinocchioOracleObservation,
  encodeCreatePinocchioMarket,
  associatedTokenAddress,
  associatedTokenAddressWithBump,
  createAssociatedTokenAccountIdempotentInstruction,
  borrowAprAtUtilization,
  getMintDecimals,
  validateSupportedMintData,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  PINOCCHIO_PROGRAM_ID,
  PINOCCHIO_TAG,
  pinocchioAmount,
  pinocchioInstruction,
  pinocchioPdas,
  pinocchioShares,
  RATE_SCALE,
  type ImmutableRateCurve,
} from "@meme-lend/sdk";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
  type Connection,
} from "@solana/web3.js";

export type MarketAction =
  "Supply" | "Withdraw" | "Deposit collateral" | "Borrow" | "Repay" | "Liquidate";
export const RATE_MODELS = {
  borrowerFriendly: {
    label: "Borrower Friendly",
    curve: {
      startBorrowApr: RATE_SCALE / 100n,
      targetUtilizationBps: 8500,
      targetBorrowApr: RATE_SCALE / 10n,
      maxBorrowApr: RATE_SCALE,
      aboveTargetShape: 1,
    },
  },
  balanced: {
    label: "Balanced",
    curve: {
      startBorrowApr: (RATE_SCALE * 2n) / 100n,
      targetUtilizationBps: 8000,
      targetBorrowApr: (RATE_SCALE * 20n) / 100n,
      maxBorrowApr: (RATE_SCALE * 220n) / 100n,
      aboveTargetShape: 2,
    },
  },
  protectLenders: {
    label: "Protect Lenders",
    curve: {
      startBorrowApr: (RATE_SCALE * 5n) / 100n,
      targetUtilizationBps: 7000,
      targetBorrowApr: (RATE_SCALE * 30n) / 100n,
      maxBorrowApr: (RATE_SCALE * 330n) / 100n,
      aboveTargetShape: 3,
    },
  },
} as const satisfies Record<string, { label: string; curve: ImmutableRateCurve }>;
export const PROTOCOL_ORACLE_PUBLISHERS = [
  new PublicKey("6DJEenuAhzDojLcGgDhs8MjtxbP9xnUpAdUG5qVmZBa1"),
  new PublicKey("GsoCUeJyngZMnt4Mm9Uptgavp9Poq1EskoKUou8ackGV"),
] as const;
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

const divideUp = (numerator: bigint, denominator: bigint) =>
  numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;

const SECONDS_PER_YEAR = 31_536_000n;
const U64_MAX = (1n << 64n) - 1n;

export function previewAccruedBorrowState(input: {
  cash: bigint;
  totalDebt: bigint;
  totalBorrowShares: bigint;
  borrowIndex: bigint;
  lastAccrualTimestamp: bigint;
  now: bigint;
  rateCurve: ImmutableRateCurve;
}) {
  const elapsed = input.now - input.lastAccrualTimestamp;
  if (elapsed <= 0n || input.totalDebt === 0n)
    return { borrowIndex: input.borrowIndex, totalDebt: input.totalDebt };
  if (input.totalBorrowShares === 0n) throw new Error("Market debt accounting is invalid");
  const utilization = (input.totalDebt * RATE_SCALE) / (input.cash + input.totalDebt);
  const rate = borrowAprAtUtilization(input.rateCurve, utilization);
  const growth = divideUp(rate * elapsed, SECONDS_PER_YEAR);
  const maxIndex = (U64_MAX * RATE_SCALE) / input.totalBorrowShares;
  const room = maxIndex > input.borrowIndex ? maxIndex - input.borrowIndex : 0n;
  const maxGrowth = (room * RATE_SCALE) / input.borrowIndex;
  const boundedGrowth = growth < maxGrowth ? growth : maxGrowth;
  const delta = divideUp(input.borrowIndex * boundedGrowth, RATE_SCALE);
  const borrowIndex = input.borrowIndex + (delta < room ? delta : room);
  return {
    borrowIndex,
    totalDebt: divideUp(input.totalBorrowShares * borrowIndex, RATE_SCALE),
  };
}

const formatUnits = (value: bigint, decimals: number) => {
  const base = 10n ** BigInt(decimals),
    whole = value / base,
    fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

export class ExistingMarketError extends Error {
  constructor(readonly market: PublicKey) {
    super(`A market with these exact immutable terms already exists: ${market.toBase58()}`);
    this.name = "ExistingMarketError";
  }
}

export function requiredCollateralDeposit(input: {
  resultingDebt: bigint;
  existingCollateral: bigint;
  collateralDecimals: number;
  price: bigint;
  priceDecimals: number;
  targetLtvBps: number;
}) {
  const requiredTotal = divideUp(
    input.resultingDebt *
      10_000n *
      10n ** BigInt(input.collateralDecimals) *
      10n ** BigInt(input.priceDecimals),
    input.price * BigInt(input.targetLtvBps),
  );
  return requiredTotal > input.existingCollateral ? requiredTotal - input.existingCollateral : 0n;
}

async function data(connection: Connection, key: PublicKey): Promise<Uint8Array> {
  const account = await connection.getAccountInfo(key, "confirmed");
  if (!account) throw new Error(`Required on-chain account is missing: ${key.toBase58()}`);
  return account.data;
}

export async function buildCreateMarketTransaction(input: {
  marketName: string;
  collateralMint: string;
  lltvBps: 3000 | 4000 | 5000 | 6000 | 6500;
  rateCurve: ImmutableRateCurve;
  marketBorrowCap: string;
  walletBorrowCap: string;
  initialLiquidity: string;
  owner: PublicKey;
  connection: Connection;
}): Promise<{ transaction: Transaction; liquidityTransaction: Transaction; market: PublicKey }> {
  const programId = id();
  const marketName = input.marketName.trim().replace(/\s+/g, " ");
  if (marketName.length < 3 || marketName.length > 50)
    throw new Error("Market name must be between 3 and 50 characters");
  if (!/^[\p{L}\p{N} .,'&()_-]+$/u.test(marketName))
    throw new Error("Market name contains unsupported characters");
  const [globalConfig] = pinocchioPdas.globalConfig(programId);
  const global = decodePinocchioGlobalConfig(await data(input.connection, globalConfig));
  if (global.paused) throw new Error("Protocol market creation is paused");
  const collateralAddress = input.collateralMint.trim();
  if (!collateralAddress) throw new Error("Enter the Solana mint address for the memecoin");
  let collateralMint: PublicKey;
  try {
    collateralMint = new PublicKey(collateralAddress);
  } catch {
    throw new Error("The collateral mint is not a valid Solana address");
  }
  const loanMint = global.approvedLoanMint;
  const [ci, li] = await Promise.all([
    input.connection.getAccountInfo(collateralMint),
    input.connection.getAccountInfo(loanMint),
  ]);
  if (!ci)
    throw new Error(
      `Collateral mint ${collateralMint.toBase58()} does not exist on Solana mainnet`,
    );
  if (!li)
    throw new Error(`Approved USDC mint ${loanMint.toBase58()} does not exist on this RPC network`);
  const collateralTokenProgram = ci.owner,
    loanTokenProgram = li.owner;
  for (const token of [collateralTokenProgram, loanTokenProgram])
    if (!token.equals(TOKEN_PROGRAM_ID) && !token.equals(TOKEN_2022_PROGRAM_ID))
      throw new Error("Unsupported token program");
  if (collateralMint.equals(loanMint)) throw new Error("Collateral cannot be the USDC loan mint");
  validateSupportedMintData(ci.data, collateralTokenProgram, "Collateral");
  validateSupportedMintData(li.data, loanTokenProgram, "Approved USDC loan mint");
  const decimals = await getMintDecimals(input.connection, loanMint, loanTokenProgram);
  const initialLiquidity = parseUnits(input.initialLiquidity, decimals);
  const marketBorrowCap = parseUnits(input.marketBorrowCap, decimals);
  const walletBorrowCap = parseUnits(input.walletBorrowCap, decimals);
  if (walletBorrowCap > marketBorrowCap)
    throw new Error("Wallet borrow cap cannot exceed the total market borrow cap");
  const config = {
    lltvBps: input.lltvBps,
    liquidationBonusBps: 1000,
    closeFactorBps: 5000,
    creatorFeeBps: 1000,
    protocolFeeBps: 500,
    rateCurve: input.rateCurve,
    marketBorrowCap,
    walletBorrowCap,
    oracleMaxAgeSeconds: Math.min(global.maxOracleAgeSeconds, 60),
    oracleMaxConfidenceBps: 500,
    oracleMaxDeviationBps: 1000,
    oraclePriceDecimals: 18,
    oracleSources: PROTOCOL_ORACLE_PUBLISHERS,
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
  const existingMarket = await input.connection.getAccountInfo(market, "confirmed");
  if (existingMarket) throw new ExistingMarketError(market);
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
    new TransactionInstruction({
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      keys: [],
      data: Buffer.from(`lend-meme-loans:market-name:${marketName}`, "utf8"),
    }),
  );
  const ownerLoan = associatedTokenAddress(loanMint, input.owner, loanTokenProgram);
  const ownerLoanAccount = await input.connection.getAccountInfo(ownerLoan, "confirmed");
  if (!ownerLoanAccount)
    throw new Error("Your wallet does not have a USDC token account to seed this market");
  if (!ownerLoanAccount.owner.equals(loanTokenProgram) || ownerLoanAccount.data.length < 165)
    throw new Error("Your wallet's USDC token account is invalid");
  const ownerLoanMint = new PublicKey(ownerLoanAccount.data.slice(0, 32));
  if (!ownerLoanMint.equals(loanMint)) throw new Error("Your token account is not mainnet USDC");
  const ownerLoanBalance = ownerLoanAccount.data.readBigUInt64LE(64);
  if (ownerLoanBalance < initialLiquidity)
    throw new Error("Your wallet does not have enough USDC for the initial liquidity amount");
  const [lender, lenderBump] = pinocchioPdas.lenderPosition(market, input.owner, programId);
  const liquidityTransaction = new Transaction().add(
    pinocchioInstruction(
      PINOCCHIO_TAG.supplyUsdc,
      [
        m(input.owner, true, true),
        m(market, true),
        m(lender, true),
        m(ownerLoan, true),
        m(liquidityVault, true),
        m(loanMint),
        m(authority),
        m(loanTokenProgram),
        m(SystemProgram.programId),
      ],
      Buffer.concat([Buffer.from(pinocchioAmount(initialLiquidity)), Buffer.from([lenderBump])]),
      programId,
    ),
  );
  return { transaction, liquidityTransaction, market };
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

export async function buildBorrowWithCollateralTransaction(input: {
  collateralAmount: string;
  borrowAmount: string;
  market: string;
  owner: PublicKey;
  connection: Connection;
}) {
  const borrow = await buildMarketTransaction({
    action: "Borrow",
    amount: input.borrowAmount,
    market: input.market,
    owner: input.owner,
    connection: input.connection,
  });
  if (Number(input.collateralAmount) === 0) return borrow;
  const deposit = await buildMarketTransaction({
    action: "Deposit collateral",
    amount: input.collateralAmount,
    market: input.market,
    owner: input.owner,
    connection: input.connection,
  });
  return new Transaction().add(...deposit.instructions, ...borrow.instructions);
}

export async function calculateBorrowCollateral(input: {
  borrowAmount: string;
  market: string;
  owner: PublicKey;
  connection: Connection;
}) {
  const programId = id(),
    marketKey = new PublicKey(input.market),
    marketInfo = await input.connection.getAccountInfo(marketKey, "confirmed");
  if (!marketInfo || !marketInfo.owner.equals(programId)) throw new Error("Market is unavailable");
  const market = decodePinocchioMarket(marketInfo.data);
  const loanProgram = market.loanToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const loanDecimals = await getMintDecimals(input.connection, market.loanMint, loanProgram);
  const requestedDebt = parseUnits(input.borrowAmount, loanDecimals);
  const [oracleConfigKey] = pinocchioPdas.oracleConfig(marketKey, programId),
    [observationKey] = pinocchioPdas.oracleObservation(marketKey, programId),
    [positionKey] = pinocchioPdas.borrowerPosition(marketKey, input.owner, programId);
  const [authority] = pinocchioPdas.marketAuthority(marketKey, programId);
  const liquidityKey = associatedTokenAddress(market.loanMint, authority, loanProgram);
  const [oracleInfo, observationInfo, positionInfo, collateralMintInfo, liquidityInfo] =
    await input.connection.getMultipleAccountsInfo(
      [oracleConfigKey, observationKey, positionKey, market.collateralMint, liquidityKey],
      "confirmed",
    );
  if (!oracleInfo || !oracleInfo.owner.equals(programId))
    throw new Error("This market has no valid oracle configuration");
  if (!observationInfo || !observationInfo.owner.equals(programId))
    throw new Error("Borrowing is not available yet because the oracle has not published a price");
  if (!collateralMintInfo) throw new Error("Collateral mint is unavailable");
  if (!liquidityInfo || !liquidityInfo.owner.equals(loanProgram) || liquidityInfo.data.length < 72)
    throw new Error("Market USDC liquidity account is unavailable");
  const oracle = decodePinocchioOracleConfiguration(oracleInfo.data),
    observation = decodePinocchioOracleObservation(observationInfo.data),
    now = BigInt(Math.floor(Date.now() / 1000));
  if (
    observation.price === 0n ||
    observation.publisher.equals(PublicKey.default) ||
    !observation.market.equals(marketKey) ||
    observation.confidenceBps > oracle.maxConfidenceBps ||
    observation.deviationBps > oracle.maxDeviationBps ||
    observation.maxRecoverableUsdc === 0n ||
    observation.publishedAt > now ||
    now - observation.publishedAt > BigInt(oracle.maxAgeSeconds)
  )
    throw new Error("Borrowing is paused because the oracle price is not fresh");
  const position = positionInfo?.owner.equals(programId)
    ? decodePinocchioBorrowerPosition(positionInfo.data)
    : null;
  const cash = liquidityInfo.data.readBigUInt64LE(64);
  const accrued = previewAccruedBorrowState({
    cash,
    totalDebt: market.totalDebt,
    totalBorrowShares: market.totalBorrowShares,
    borrowIndex: market.borrowIndex,
    lastAccrualTimestamp: market.lastAccrualTimestamp,
    now,
    rateCurve: market.rateCurve,
  });
  const newBorrowShares = divideUp(requestedDebt * RATE_SCALE, accrued.borrowIndex);
  const resultingDebt = divideUp(
    ((position?.borrowShares ?? 0n) + newBorrowShares) * accrued.borrowIndex,
    RATE_SCALE,
  );
  const resultingTotalDebt = divideUp(
    (market.totalBorrowShares + newBorrowShares) * accrued.borrowIndex,
    RATE_SCALE,
  );
  if (resultingDebt > market.walletBorrowCap)
    throw new Error(
      "This amount would exceed the wallet borrowing limit after including interest already accrued.",
    );
  if (resultingTotalDebt > market.marketBorrowCap)
    throw new Error(
      "This amount would exceed the market borrowing limit after including interest already accrued.",
    );
  if (resultingDebt > observation.maxRecoverableUsdc)
    throw new Error("That amount exceeds the oracle's safe liquidity limit");
  const collateralDecimals = collateralMintInfo.data[44];
  if (collateralDecimals === undefined) throw new Error("Collateral mint data is invalid");
  const targetLtvBps = Math.max(1, Math.floor((market.lltvBps * 8_000) / 10_000)),
    existingCollateral = position?.collateralAmount ?? 0n,
    additionalCollateral = requiredCollateralDeposit({
      resultingDebt,
      existingCollateral,
      collateralDecimals,
      price: observation.price,
      priceDecimals: oracle.priceDecimals,
      targetLtvBps,
    });
  return {
    collateralAmount: formatUnits(additionalCollateral, collateralDecimals),
    collateralDecimals,
    targetLtvBps,
  };
}
