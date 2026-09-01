# Verifiable program release

The release workflow builds the active optimized `meme_lending_pinocchio.so` with the pinned Agave
toolchain. It extracts the embedded `security.txt` and publishes the binary and SHA-256 digest as a
GitHub Actions artifact. The legacy Anchor reference is tested by CI but is not a deployment or
release artifact.

Before deployment, publish the exact source revision and build artifact. A private repository cannot
be independently rebuilt by the public and therefore cannot support a public verification claim.

After the approved mainnet upgrade authority deploys the exact Pinocchio artifact, dump the
executable and compare it byte-for-byte with the published workflow artifact:

```sh
solana program dump 8hDEL5BuW2BgeMuCBKqZyRubGTqFmx8Ds3PQ2k6puJym deployed.so \
  --url mainnet-beta
sha256sum deployed.so target/verifiable/meme_lending_pinocchio.so
npx @solana-program/program-metadata@latest write security \
  8hDEL5BuW2BgeMuCBKqZyRubGTqFmx8Ds3PQ2k6puJym metadata/security.json \
  --rpc "$SOLANA_RPC_HTTP"
```

The first two commands retrieve and compare the deployed executable. The final command
writes canonical metadata using the secured release authority. For an offline single-key authority,
sign only from the operator workstation; never expose the key to CI or Railway. Multisig operators
may append `--export <multisig-address>` to produce an unsigned transaction for review.

When the program was deployed with extra upgrade capacity, `program dump` includes zero padding.
Compare the prefix matching the published ELF length and verify that every remaining byte is zero;
the full padded-file digest will intentionally differ. Record the deployment signature,
program-data address, upgrade authority, source revision, binary
digest, and verification output in the release notes. Never deploy `target/deploy/meme_lending.so`;
deploy only the artifact produced by the verifiable workflow and approved through the documented
release process. The Anchor reference program ID is
`9VHZhNZkrsocLmafGBmbG2mCiAnwA1WaBTG1aNb2kr4j`; it is not the optimized deployment target.
