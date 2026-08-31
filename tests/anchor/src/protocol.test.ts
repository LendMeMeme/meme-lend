import assert from "node:assert/strict";
import test from "node:test";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../../../packages/sdk/src/idl/meme_lending.json" with { type: "json" };
import type { MemeLending } from "../../../packages/sdk/src/idl/meme_lending.js";

const PROGRAM_ID = new PublicKey("9VHZhNZkrsocLmafGBmbG2mCiAnwA1WaBTG1aNb2kr4j");
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

const localnetConfigured = Boolean(process.env.ANCHOR_PROVIDER_URL && process.env.ANCHOR_WALLET);

test(
  "initializes the protocol once with an approved loan mint",
  { skip: localnetConfigured ? false : "requires ANCHOR_PROVIDER_URL and ANCHOR_WALLET" },
  async () => {
    const provider = AnchorProvider.env();
    const program = new Program<MemeLending>(idl as MemeLending, provider);
    assert.equal(program.programId.toBase58(), PROGRAM_ID.toBase58());
    const payer = (provider.wallet as unknown as { payer: Keypair }).payer;
    const loanMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    const [globalConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-config")],
      PROGRAM_ID,
    );
    const recipient = Keypair.generate().publicKey;
    const [programData] = PublicKey.findProgramAddressSync(
      [PROGRAM_ID.toBuffer()],
      BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
    );
    const signature = await program.methods
      .initializeProtocol(120)
      .accountsStrict({
        authority: provider.wallet.publicKey,
        program: PROGRAM_ID,
        programData,
        loanMint,
        protocolFeeRecipient: recipient,
        globalConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const confirmation = await provider.connection.confirmTransaction(signature, "confirmed");
    assert.equal(confirmation.value.err, null);
    const account = await program.account.globalConfig.fetch(globalConfig);
    assert.equal((account.approvedLoanMint as PublicKey).toBase58(), loanMint.toBase58());
    assert.equal(account.paused, false);
  },
);
