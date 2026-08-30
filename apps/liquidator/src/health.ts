export interface HealthInput {
  borrowShares: bigint;
  borrowIndex: bigint;
  collateralAmount: bigint;
  collateralDecimals: number;
  price: bigint;
  lltvBps: number;
  closeFactorBps: number;
  maxRepay: bigint;
}

const RATE_SCALE = 1_000_000_000_000_000_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export function evaluateHealth(input: HealthInput) {
  if (input.collateralDecimals < 0 || input.collateralDecimals > 18)
    throw new Error("Unsupported collateral decimals");
  const debt = ceilDiv(input.borrowShares * input.borrowIndex, RATE_SCALE);
  const collateralValue =
    (input.collateralAmount * input.price) / (10n ** BigInt(input.collateralDecimals) * RATE_SCALE);
  const liquidationLimit = (collateralValue * BigInt(input.lltvBps)) / 10_000n;
  const closeCap = (debt * BigInt(input.closeFactorBps)) / 10_000n;
  return {
    debt,
    collateralValue,
    liquidationLimit,
    unhealthy: debt > liquidationLimit,
    requestedRepay: closeCap < input.maxRepay ? closeCap : input.maxRepay,
  };
}

export function observationIsFresh(
  now: bigint,
  publishedAt: bigint,
  maxAgeSeconds: number,
): boolean {
  const age = now - publishedAt;
  return age >= 0n && age <= BigInt(maxAgeSeconds);
}
