# Verifiable program release

The release workflow builds `meme_lending.so` with Anchor 0.31.1 in Anchor's pinned container,
extracts the embedded `security.txt`, and publishes the binary, IDL, metadata, and SHA-256 digest as
a GitHub Actions artifact.

Before deployment, publish the exact source revision and build artifact. A private repository cannot
be independently rebuilt by the public and therefore cannot support a public verification claim.

After the mainnet multisig deploys the exact artifact:

```sh
anchor verify -p meme_lending 9VHZhNZkrsocLmafGBmbG2mCiAnwA1WaBTG1aNb2kr4j \
  --provider.cluster mainnet
npx @solana-program/program-metadata@latest write security \
  9VHZhNZkrsocLmafGBmbG2mCiAnwA1WaBTG1aNb2kr4j metadata/security.json \
  --rpc "$SOLANA_RPC_HTTP" --export "$MULTISIG_ADDRESS"
```

The first command compares the reproducible local build to the deployed executable. The second
exports the canonical metadata transaction for multisig review and signing; it does not expose an
authority key to CI or Railway.

Record the deployment signature, program-data address, upgrade authority, source revision, binary
digest, and verification output in the release notes. Never deploy `target/deploy/meme_lending.so`;
deploy only the artifact produced by the verifiable workflow and reviewed by the multisig.
