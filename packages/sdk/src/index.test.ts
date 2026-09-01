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
        rateModelId: 0 as const,
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
    expect(first.data).toHaveLength(237);
    expect(first.data.at(-1)).toBe(7);
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
