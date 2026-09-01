import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  associatedTokenAddressWithBump,
  createAssociatedTokenAccountIdempotentInstruction,
  encodeCreatePinocchioMarket,
  encodePinocchioOracleObservation,
  healthFactorBps,
  mulDivCeil,
  mulDivFloor,
  PINOCCHIO_TAG,
  pinocchioPdas,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  validateSupportedMintData,
  borrowAprAtUtilization,
  lenderAprAtUtilization,
  projectSimpleAprDebt,
  validateRateCurve,
  MAX_BORROW_APR,
  RATE_SCALE,
  decodePinocchioMarket,
} from "./index.js";
describe("fixed point math", () => {
  it("rounds claims down and debt up", () => {
    expect(mulDivFloor(10n, 2n, 3n)).toBe(6n);
    expect(mulDivCeil(10n, 2n, 3n)).toBe(7n);
  });
  it("reports no finite health factor without debt", () => {
    expect(healthFactorBps(1n, 0n, 6500)).toBeNull();
  });
});

describe("optimized program ABI", () => {
  it("accepts safe Token-2022 metadata and rejects behavioral extensions", () => {
    const mint = new Uint8Array(82);
    mint[44] = 6;
    mint[45] = 1;
    expect(validateSupportedMintData(mint, TOKEN_PROGRAM_ID)).toBe(6);
    expect(() => validateSupportedMintData(new Uint8Array(82), TOKEN_PROGRAM_ID)).toThrow(
      "not an initialized token mint",
    );
    const token2022Mint = new Uint8Array(174);
    token2022Mint[44] = 6;
    token2022Mint[45] = 1;
    token2022Mint[165] = 1;
    token2022Mint[166] = 18; // MetadataPointer
    token2022Mint[168] = 4;
    expect(validateSupportedMintData(token2022Mint, TOKEN_2022_PROGRAM_ID)).toBe(6);

    token2022Mint[166] = 1; // TransferFeeConfig
    expect(() =>
      validateSupportedMintData(token2022Mint, TOKEN_2022_PROGRAM_ID, "Collateral"),
    ).toThrow("unsupported Token-2022 extension type 1");
  });

  it("accepts the Pump.fun Create V2 Token-2022 mint layout", () => {
    // Create V2 uses a six-decimal mint with MetadataPointer (18), followed
    // by the variable-length TokenMetadata record (19).
    const pumpMint = new Uint8Array(185);
    pumpMint[44] = 6;
    pumpMint[45] = 1;
    pumpMint[165] = 1;
    pumpMint[166] = 18;
    pumpMint[168] = 4;
    pumpMint[174] = 19;
    pumpMint[176] = 7;
    expect(validateSupportedMintData(pumpMint, TOKEN_2022_PROGRAM_ID, "Pump.fun mint")).toBe(6);
  });

  it("derives and creates canonical associated token accounts without the SPL client bundle", () => {
    const owner = PublicKey.unique();
    const mint = PublicKey.unique();
    const payer = PublicKey.unique();
    const [ata, bump] = associatedTokenAddressWithBump(mint, owner, TOKEN_PROGRAM_ID);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(PublicKey.isOnCurve(ata.toBytes())).toBe(false);
    const instruction = createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
    );
    expect(instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect([...instruction.data]).toEqual([1]);
    expect(instruction.keys.map(({ pubkey }) => pubkey.toBase58())).toEqual(
      [
        payer,
        ata,
        owner,
        mint,
        new PublicKey("11111111111111111111111111111111"),
        TOKEN_PROGRAM_ID,
      ].map((key) => key.toBase58()),
    );
  });

  it("keeps all eighteen tags stable and derives isolated position addresses", () => {
    expect(Object.values(PINOCCHIO_TAG)).toEqual([...Array(18).keys()]);
    const market = new PublicKey("11111111111111111111111111111111");
    const first = pinocchioPdas.lenderPosition(market, PublicKey.unique())[0];
    const second = pinocchioPdas.lenderPosition(market, PublicKey.unique())[0];
    expect(first.equals(second)).toBe(false);
  });

  it("commits every immutable market field into deterministic creation bytes", async () => {
    const key = new PublicKey("11111111111111111111111111111111");
    const input = {
      creator: key,
      collateralMint: key,
      loanMint: key,
      collateralTokenProgram: key,
      loanTokenProgram: key,
      config: {
        lltvBps: 5000 as const,
        liquidationBonusBps: 1000,
        closeFactorBps: 5000,
        creatorFeeBps: 1000,
        protocolFeeBps: 500,
        rateCurve: {
          startBorrowApr: RATE_SCALE / 50n,
          targetUtilizationBps: 8000,
          targetBorrowApr: RATE_SCALE / 5n,
          maxBorrowApr: (RATE_SCALE * 22n) / 10n,
          aboveTargetShape: 2 as const,
        },
        marketBorrowCap: 1_000_000n,
        walletBorrowCap: 100_000n,
        oracleMaxAgeSeconds: 60,
        oracleMaxConfidenceBps: 500,
        oracleMaxDeviationBps: 1000,
        oraclePriceDecimals: 18,
        oracleSources: [key],
      },
      bumps: [1, 2, 3, 4, 5, 6, 7] as const,
    };
    const first = await encodeCreatePinocchioMarket(input);
    const second = await encodeCreatePinocchioMarket(input);
    expect(first.data).toEqual(second.data);
    expect(first.data.slice(0, 32)).toEqual(first.configHash);
    expect(first.data).toHaveLength(287);
    expect(first.data.at(-1)).toBe(7);

    const variants = [
      { ...input.config.rateCurve, startBorrowApr: input.config.rateCurve.startBorrowApr + 1n },
      { ...input.config.rateCurve, targetUtilizationBps: 7999 },
      { ...input.config.rateCurve, targetBorrowApr: input.config.rateCurve.targetBorrowApr + 1n },
      { ...input.config.rateCurve, maxBorrowApr: input.config.rateCurve.maxBorrowApr + 1n },
      { ...input.config.rateCurve, aboveTargetShape: 3 as const },
    ];
    const hashes = await Promise.all(
      variants.map(
        async (rateCurve) =>
          (await encodeCreatePinocchioMarket({ ...input, config: { ...input.config, rateCurve } }))
            .configHash,
      ),
    );
    expect(
      new Set([first.configHash, ...hashes].map((hash) => Buffer.from(hash).toString("hex"))).size,
    ).toBe(6);
  });

  it("encodes bounded oracle observations using the exact optimized ABI", () => {
    const data = encodePinocchioOracleObservation({
      price: 1_250_000_000_000_000_000_000_000n,
      confidenceBps: 25,
      deviationBps: 40,
      maxRecoverableUsdc: 50_000_000n,
      publishedAt: 1_800_000_000n,
      sequence: 7n,
      bump: 254,
    });
    expect(data).toHaveLength(45);
    expect(data.at(-1)).toBe(254);
  });
});

describe("immutable APR curves", () => {
  const curve = {
    startBorrowApr: RATE_SCALE / 100n,
    targetUtilizationBps: 8000,
    targetBorrowApr: RATE_SCALE / 5n,
    maxBorrowApr: MAX_BORROW_APR,
    aboveTargetShape: 3 as const,
  };

  it("matches exact boundary rates through the 20,000,000% ceiling", () => {
    expect(borrowAprAtUtilization(curve, 0n)).toBe(curve.startBorrowApr);
    expect(borrowAprAtUtilization(curve, (RATE_SCALE * 8n) / 10n)).toBe(curve.targetBorrowApr);
    expect(borrowAprAtUtilization(curve, RATE_SCALE)).toBe(MAX_BORROW_APR);
    expect(lenderAprAtUtilization(curve, 0n, 1000, 500)).toBe(0n);
  });

  it("matches the on-chain preview vectors at every displayed utilization", () => {
    const balanced = {
      startBorrowApr: 20_000_000_000_000_000n,
      targetUtilizationBps: 8000,
      targetBorrowApr: 200_000_000_000_000_000n,
      maxBorrowApr: 2_200_000_000_000_000_000n,
      aboveTargetShape: 2 as const,
    };
    const expected = [
      20_000_000_000_000_000n,
      76_250_000_000_000_000n,
      132_500_000_000_000_000n,
      188_750_000_000_000_000n,
      700_000_000_000_000_000n,
      2_200_000_000_000_000_000n,
    ];
    expect(
      [0n, 25n, 50n, 75n, 90n, 100n].map((percent) =>
        borrowAprAtUtilization(balanced, (RATE_SCALE * percent) / 100n),
      ),
    ).toEqual(expected);
  });

  it("rejects invalid, non-monotonic, and out-of-range curves", () => {
    expect(() =>
      validateRateCurve({ ...curve, startBorrowApr: curve.targetBorrowApr + 1n }),
    ).toThrow();
    expect(() => validateRateCurve({ ...curve, targetBorrowApr: MAX_BORROW_APR + 1n })).toThrow();
    expect(() => validateRateCurve({ ...curve, targetUtilizationBps: 10_000 })).toThrow();
    expect(() => validateRateCurve({ ...curve, maxBorrowApr: MAX_BORROW_APR + 1n })).toThrow();
  });

  it("projects simple APR debt without presenting compounding", () => {
    expect(projectSimpleAprDebt(100n, RATE_SCALE, 31_536_000n)).toBe(200n);
    expect(projectSimpleAprDebt(100n, MAX_BORROW_APR, 31_536_000n)).toBe(20_000_100n);
  });

  it("decodes existing 260-byte markets with their original economics", () => {
    const bytes = new Uint8Array(260);
    bytes[0] = 1;
    bytes[1] = 2;
    bytes[145] = 1;
    const decoded = decodePinocchioMarket(bytes);
    expect(decoded.version).toBe(1);
    expect(decoded.rateCurve.startBorrowApr).toBe(RATE_SCALE / 20n);
    expect(decoded.rateCurve.targetBorrowApr).toBe((RATE_SCALE * 30n) / 100n);
    expect(decoded.rateCurve.maxBorrowApr).toBe((RATE_SCALE * 330n) / 100n);
  });
});
