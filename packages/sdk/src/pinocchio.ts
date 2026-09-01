import { PublicKey, TransactionInstruction, type AccountMeta } from "@solana/web3.js";

export const PINOCCHIO_PROGRAM_ID = new PublicKey("8hDEL5BuW2BgeMuCBKqZyRubGTqFmx8Ds3PQ2k6puJym");
export const PINOCCHIO_MARKET_LEN = 260;
export const PINOCCHIO_GLOBAL_CONFIG_LEN = 144;

export const PINOCCHIO_TAG = {
  initializeProtocol: 0,
  createMarket: 1,
  setProtocolPause: 2,
  pauseMarket: 3,
  accrueInterest: 4,
  supplyUsdc: 5,
  withdrawUsdc: 6,
  submitOracleObservation: 7,
  depositCollateral: 8,
  withdrawCollateral: 9,
  borrowUsdc: 10,
  repayUsdc: 11,
  depositFirstLossReserve: 12,
  claimMarketCreatorFees: 13,
  claimProtocolFees: 14,
  liquidate: 15,
  fundLenderRewards: 16,
  claimLenderRewards: 17,
} as const;

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function unsigned(value: bigint, bytes: number): Uint8Array {
  if (value < 0n || value >= 1n << BigInt(bytes * 8)) throw new Error("Unsigned value overflow");
  const output = new Uint8Array(bytes);
  let remaining = value;
  for (let index = 0; index < bytes; index += 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function signed(value: bigint, bytes: number): Uint8Array {
  const limit = 1n << BigInt(bytes * 8 - 1);
  if (value < -limit || value >= limit) throw new Error("Signed value overflow");
  return unsigned(value < 0n ? (1n << BigInt(bytes * 8)) + value : value, bytes);
}

function readUnsigned(data: Uint8Array, offset: number, bytes: number): bigint {
  let value = 0n;
  for (let index = bytes - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(data[offset + index] ?? 0);
  }
  return value;
}

function readSigned(data: Uint8Array, offset: number, bytes: number): bigint {
  const value = readUnsigned(data, offset, bytes);
  const sign = 1n << BigInt(bytes * 8 - 1);
  return (value & sign) === 0n ? value : value - (1n << BigInt(bytes * 8));
}

function assertState(data: Uint8Array, length: number, kind: number): void {
  if (data.length !== length || data[0] !== 1 || data[1] !== kind)
    throw new Error("Invalid optimized program account");
}

export type PinocchioGlobalConfig = {
  authority: PublicKey;
  approvedLoanMint: PublicKey;
  protocolFeeRecipient: PublicKey;
  marketCount: bigint;
  maxOracleAgeSeconds: number;
  paused: boolean;
};

export function decodePinocchioGlobalConfig(data: Uint8Array): PinocchioGlobalConfig {
  assertState(data, PINOCCHIO_GLOBAL_CONFIG_LEN, 1);
  return {
    authority: new PublicKey(data.slice(3, 35)),
    approvedLoanMint: new PublicKey(data.slice(67, 99)),
    protocolFeeRecipient: new PublicKey(data.slice(99, 131)),
    marketCount: readUnsigned(data, 131, 8),
    maxOracleAgeSeconds: Number(readUnsigned(data, 139, 4)),
    paused: (data[143] & 1) !== 0,
  };
}

export type PinocchioMarket = {
  bump: number;
  authorityBump: number;
  vaultBumps: readonly [number, number, number];
  creator: PublicKey;
  collateralMint: PublicKey;
  loanMint: PublicKey;
  configHash: Uint8Array;
  lltvBps: number;
  liquidationBonusBps: number;
  closeFactorBps: number;
  creatorFeeBps: number;
  protocolFeeBps: number;
  rateModelId: number;
  borrowingPaused: boolean;
  rewardsEnabled: boolean;
  collateralToken2022: boolean;
  loanToken2022: boolean;
  marketBorrowCap: bigint;
  walletBorrowCap: bigint;
  totalSupplyShares: bigint;
  totalBorrowShares: bigint;
  borrowIndex: bigint;
  totalDebt: bigint;
  badDebt: bigint;
  creatorFeesClaimable: bigint;
  protocolFeesClaimable: bigint;
  lastAccrualTimestamp: bigint;
};

export function decodePinocchioMarket(data: Uint8Array): PinocchioMarket {
  assertState(data, PINOCCHIO_MARKET_LEN, 2);
  const flags = data[146];
  const tokenFlags = data[147];
  return {
    bump: data[2],
    authorityBump: data[3],
    vaultBumps: [data[4], data[5], data[6]],
    creator: new PublicKey(data.slice(7, 39)),
    collateralMint: new PublicKey(data.slice(39, 71)),
    loanMint: new PublicKey(data.slice(71, 103)),
    configHash: data.slice(103, 135),
    lltvBps: Number(readUnsigned(data, 135, 2)),
    liquidationBonusBps: Number(readUnsigned(data, 137, 2)),
    closeFactorBps: Number(readUnsigned(data, 139, 2)),
    creatorFeeBps: Number(readUnsigned(data, 141, 2)),
    protocolFeeBps: Number(readUnsigned(data, 143, 2)),
    rateModelId: data[145],
    borrowingPaused: (flags & 1) !== 0,
    rewardsEnabled: (flags & 2) !== 0,
    collateralToken2022: (tokenFlags & 1) !== 0,
    loanToken2022: (tokenFlags & 2) !== 0,
    marketBorrowCap: readUnsigned(data, 148, 8),
    walletBorrowCap: readUnsigned(data, 156, 8),
    totalSupplyShares: readUnsigned(data, 164, 16),
    totalBorrowShares: readUnsigned(data, 180, 16),
    borrowIndex: readUnsigned(data, 196, 16),
    totalDebt: readUnsigned(data, 212, 16),
    badDebt: readUnsigned(data, 228, 8),
    creatorFeesClaimable: readUnsigned(data, 236, 8),
    protocolFeesClaimable: readUnsigned(data, 244, 8),
    lastAccrualTimestamp: readSigned(data, 252, 8),
  };
}

export function decodePinocchioOracleConfiguration(data: Uint8Array) {
  assertState(data, 207, 3);
  const sourceCount = data[45];
  if (sourceCount < 1 || sourceCount > 5) throw new Error("Invalid oracle source count");
  return {
    market: new PublicKey(data.slice(3, 35)),
    kind: data[35],
    maxAgeSeconds: Number(readUnsigned(data, 36, 4)),
    maxConfidenceBps: Number(readUnsigned(data, 40, 2)),
    maxDeviationBps: Number(readUnsigned(data, 42, 2)),
    priceDecimals: data[44],
    sourceCount,
    sources: Array.from(
      { length: sourceCount },
      (_, index) => new PublicKey(data.slice(46 + index * 32, 78 + index * 32)),
    ),
    customHighRisk: (data[206] & 1) !== 0,
  };
}

export function decodePinocchioOracleObservation(data: Uint8Array) {
  assertState(data, 111, 4);
  return {
    market: new PublicKey(data.slice(3, 35)),
    publisher: new PublicKey(data.slice(35, 67)),
    price: readUnsigned(data, 67, 16),
    confidenceBps: Number(readUnsigned(data, 83, 2)),
    deviationBps: Number(readUnsigned(data, 85, 2)),
    maxRecoverableUsdc: readUnsigned(data, 87, 8),
    publishedAt: readSigned(data, 95, 8),
    sequence: readUnsigned(data, 103, 8),
  };
}

export function decodePinocchioReserve(data: Uint8Array) {
  assertState(data, 51, 8);
  return {
    market: new PublicKey(data.slice(3, 35)),
    deposited: readUnsigned(data, 35, 8),
    absorbedLosses: readUnsigned(data, 43, 8),
  };
}

export function decodePinocchioBorrowerPosition(data: Uint8Array) {
  assertState(data, 91, 6);
  return {
    bump: data[2],
    market: new PublicKey(data.slice(3, 35)),
    owner: new PublicKey(data.slice(35, 67)),
    collateralAmount: readUnsigned(data, 67, 8),
    borrowShares: readUnsigned(data, 75, 16),
  };
}

export function decodePinocchioLenderPosition(data: Uint8Array) {
  assertState(data, 107, 5);
  return {
    bump: data[2],
    market: new PublicKey(data.slice(3, 35)),
    owner: new PublicKey(data.slice(35, 67)),
    supplyShares: readUnsigned(data, 67, 16),
    rewardIndexCheckpoint: readUnsigned(data, 83, 16),
    rewardOwed: readUnsigned(data, 99, 8),
  };
}

function pda(programId: PublicKey, ...seeds: Uint8Array[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    programId,
  );
}

const text = (value: string) => new TextEncoder().encode(value);

export const pinocchioPdas = {
  globalConfig: (programId = PINOCCHIO_PROGRAM_ID) => pda(programId, text("global-config")),
  market: (hash: Uint8Array, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("market"), hash),
  marketAuthority: (market: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("market-authority"), market.toBytes()),
  oracleConfig: (market: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("oracle-config"), market.toBytes()),
  oracleObservation: (market: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("oracle-observation"), market.toBytes()),
  reserve: (market: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("first-loss-reserve"), market.toBytes()),
  reserveVault: (market: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("reserve-vault"), market.toBytes()),
  lenderPosition: (market: PublicKey, owner: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("lender-position"), market.toBytes(), owner.toBytes()),
  borrowerPosition: (market: PublicKey, owner: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("borrower-position"), market.toBytes(), owner.toBytes()),
  rewards: (market: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("market-rewards"), market.toBytes()),
  rewardVault: (market: PublicKey, programId = PINOCCHIO_PROGRAM_ID) =>
    pda(programId, text("reward-vault"), market.toBytes()),
};

export function pinocchioInstruction(
  tag: number,
  keys: AccountMeta[],
  payload: Uint8Array<ArrayBufferLike> = new Uint8Array(),
  programId = PINOCCHIO_PROGRAM_ID,
): TransactionInstruction {
  if (!Number.isInteger(tag) || tag < 0 || tag > 17) throw new Error("Invalid instruction tag");
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.from(concat(Uint8Array.of(tag), payload)),
  });
}

export const pinocchioAmount = (amount: bigint) => unsigned(amount, 8);
export const pinocchioShares = (shares: bigint) => unsigned(shares, 16);

export function encodePinocchioOracleObservation(input: {
  price: bigint;
  confidenceBps: number;
  deviationBps: number;
  maxRecoverableUsdc: bigint;
  publishedAt: bigint;
  sequence: bigint;
  bump: number;
}): Uint8Array {
  for (const [label, value] of [
    ["confidenceBps", input.confidenceBps],
    ["deviationBps", input.deviationBps],
  ] as const)
    if (!Number.isInteger(value) || value < 0 || value > 10_000)
      throw new Error(`${label} must be between 0 and 10000`);
  if (!Number.isInteger(input.bump) || input.bump < 0 || input.bump > 255)
    throw new Error("Invalid oracle observation bump");
  return concat(
    unsigned(input.price, 16),
    unsigned(BigInt(input.confidenceBps), 2),
    unsigned(BigInt(input.deviationBps), 2),
    unsigned(input.maxRecoverableUsdc, 8),
    signed(input.publishedAt, 8),
    unsigned(input.sequence, 8),
    Uint8Array.of(input.bump),
  );
}

export type OptimizedMarketConfig = {
  lltvBps: 3000 | 4000 | 5000 | 6000 | 6500;
  liquidationBonusBps: number;
  closeFactorBps: number;
  creatorFeeBps: number;
  protocolFeeBps: number;
  rateModelId: 0 | 1;
  marketBorrowCap: bigint;
  walletBorrowCap: bigint;
  oracleMaxAgeSeconds: number;
  oracleMaxConfidenceBps: number;
  oracleMaxDeviationBps: number;
  oraclePriceDecimals: number;
  oracleSources: readonly PublicKey[];
};

export async function encodeCreatePinocchioMarket(input: {
  creator: PublicKey;
  collateralMint: PublicKey;
  loanMint: PublicKey;
  collateralTokenProgram: PublicKey;
  loanTokenProgram: PublicKey;
  config: OptimizedMarketConfig;
  bumps: readonly [number, number, number, number, number, number, number];
}): Promise<{ configHash: Uint8Array; data: Uint8Array }> {
  const { config } = input;
  if (config.oracleSources.length < 1 || config.oracleSources.length > 5)
    throw new Error("One to five oracle sources are required");
  const sources = [...config.oracleSources];
  while (sources.length < 5) sources.push(PublicKey.default);
  const canonical = concat(
    unsigned(BigInt(config.lltvBps), 2),
    unsigned(BigInt(config.liquidationBonusBps), 2),
    unsigned(BigInt(config.closeFactorBps), 2),
    unsigned(BigInt(config.creatorFeeBps), 2),
    unsigned(BigInt(config.protocolFeeBps), 2),
    Uint8Array.of(config.rateModelId),
    unsigned(config.marketBorrowCap, 8),
    unsigned(config.walletBorrowCap, 8),
    Uint8Array.of(4),
    unsigned(BigInt(config.oracleMaxAgeSeconds), 4),
    unsigned(BigInt(config.oracleMaxConfidenceBps), 2),
    unsigned(BigInt(config.oracleMaxDeviationBps), 2),
    Uint8Array.of(config.oraclePriceDecimals, config.oracleSources.length),
    ...sources.map((source) => source.toBytes()),
  );
  const digestInput = concat(
    text("meme-lend-pinocchio-market-v1"),
    input.creator.toBytes(),
    input.collateralMint.toBytes(),
    input.loanMint.toBytes(),
    input.collateralTokenProgram.toBytes(),
    input.loanTokenProgram.toBytes(),
    canonical,
  );
  const digestBuffer = digestInput.buffer.slice(
    digestInput.byteOffset,
    digestInput.byteOffset + digestInput.byteLength,
  ) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", digestBuffer));
  return { configHash: digest, data: concat(digest, canonical, Uint8Array.from(input.bumps)) };
}
