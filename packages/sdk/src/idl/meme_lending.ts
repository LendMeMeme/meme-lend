/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/meme_lending.json`.
 */
export type MemeLending = {
  address: "9VHZhNZkrsocLmafGBmbG2mCiAnwA1WaBTG1aNb2kr4j";
  metadata: {
    name: "memeLending";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Isolated memecoin/USDC lending markets";
  };
  instructions: [
    {
      name: "accrueInterest";
      discriminator: [47, 40, 115, 198, 91, 12, 222, 49];
      accounts: [
        {
          name: "market";
          writable: true;
        },
        {
          name: "liquidityVault";
          relations: ["market"];
        },
        {
          name: "loanMint";
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanTokenProgram";
        },
      ];
      args: [];
    },
    {
      name: "borrowUsdc";
      discriminator: [31, 120, 217, 32, 182, 137, 251, 34];
      accounts: [
        {
          name: "borrower";
          signer: true;
        },
        {
          name: "globalConfig";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 108, 111, 98, 97, 108, 45, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "market";
          writable: true;
          relations: ["borrowerPosition", "oracleObservation"];
        },
        {
          name: "borrowerPosition";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 111, 114, 114, 111, 119, 101, 114];
              },
              {
                kind: "account";
                path: "market";
              },
              {
                kind: "account";
                path: "borrower";
              },
            ];
          };
        },
        {
          name: "oracleConfiguration";
          relations: ["market"];
        },
        {
          name: "oracleObservation";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 115, 101, 114, 118, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "collateralMint";
        },
        {
          name: "loanMint";
        },
        {
          name: "borrowerUsdc";
          writable: true;
        },
        {
          name: "liquidityVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanTokenProgram";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "claimMarketCreatorFees";
      discriminator: [12, 227, 152, 98, 143, 136, 181, 200];
      accounts: [
        {
          name: "creator";
          signer: true;
          relations: ["market"];
        },
        {
          name: "market";
          writable: true;
        },
        {
          name: "loanMint";
        },
        {
          name: "creatorUsdc";
          writable: true;
        },
        {
          name: "liquidityVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanTokenProgram";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "createMarket";
      discriminator: [103, 226, 97, 235, 200, 188, 251, 254];
      accounts: [
        {
          name: "creator";
          writable: true;
          signer: true;
        },
        {
          name: "globalConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 108, 111, 98, 97, 108, 45, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "collateralMint";
        },
        {
          name: "loanMint";
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "market";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [109, 97, 114, 107, 101, 116];
              },
              {
                kind: "arg";
                path: "args.config_hash";
              },
            ];
          };
        },
        {
          name: "oracleConfiguration";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 114, 97, 99, 108, 101];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "firstLossReserve";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 115, 101, 114, 118, 101];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "liquidityVault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "marketAuthority";
              },
              {
                kind: "account";
                path: "loanTokenProgram";
              },
              {
                kind: "account";
                path: "loanMint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "collateralVault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "marketAuthority";
              },
              {
                kind: "account";
                path: "collateralTokenProgram";
              },
              {
                kind: "account";
                path: "collateralMint";
              },
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89,
              ];
            };
          };
        },
        {
          name: "reserveVault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 115, 101, 114, 118, 101, 45, 118, 97, 117, 108, 116];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "collateralTokenProgram";
        },
        {
          name: "loanTokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "args";
          type: {
            defined: {
              name: "createMarketArgs";
            };
          };
        },
      ];
    },
    {
      name: "depositCollateral";
      discriminator: [156, 131, 142, 116, 146, 247, 162, 120];
      accounts: [
        {
          name: "borrower";
          writable: true;
          signer: true;
        },
        {
          name: "market";
        },
        {
          name: "borrowerPosition";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 111, 114, 114, 111, 119, 101, 114];
              },
              {
                kind: "account";
                path: "market";
              },
              {
                kind: "account";
                path: "borrower";
              },
            ];
          };
        },
        {
          name: "collateralMint";
        },
        {
          name: "borrowerCollateral";
          writable: true;
        },
        {
          name: "collateralVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "collateralTokenProgram";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "depositFirstLossReserve";
      discriminator: [8, 127, 69, 140, 96, 73, 78, 131];
      accounts: [
        {
          name: "contributor";
          signer: true;
        },
        {
          name: "market";
          relations: ["firstLossReserve"];
        },
        {
          name: "firstLossReserve";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 115, 101, 114, 118, 101];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanMint";
        },
        {
          name: "contributorUsdc";
          writable: true;
        },
        {
          name: "reserveVault";
          writable: true;
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanTokenProgram";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "fundLenderRewards";
      discriminator: [179, 167, 210, 104, 157, 250, 145, 241];
      accounts: [
        {
          name: "funder";
          writable: true;
          signer: true;
        },
        {
          name: "market";
        },
        {
          name: "rewardMint";
        },
        {
          name: "marketRewards";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 119, 97, 114, 100, 115];
              },
              {
                kind: "account";
                path: "market";
              },
              {
                kind: "account";
                path: "rewardMint";
              },
            ];
          };
        },
        {
          name: "rewardVault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 119, 97, 114, 100, 45, 118, 97, 117, 108, 116];
              },
              {
                kind: "account";
                path: "market";
              },
              {
                kind: "account";
                path: "rewardMint";
              },
            ];
          };
        },
        {
          name: "funderRewards";
          writable: true;
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "rewardTokenProgram";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "initializeProtocol";
      discriminator: [188, 233, 252, 106, 134, 146, 202, 91];
      accounts: [
        {
          name: "authority";
          writable: true;
          signer: true;
        },
        {
          name: "loanMint";
        },
        {
          name: "protocolFeeRecipient";
        },
        {
          name: "globalConfig";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [103, 108, 111, 98, 97, 108, 45, 99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "maxOracleAgeSeconds";
          type: "u32";
        },
      ];
    },
    {
      name: "liquidate";
      discriminator: [223, 179, 226, 125, 48, 46, 39, 74];
      accounts: [
        {
          name: "liquidator";
          signer: true;
        },
        {
          name: "market";
          writable: true;
          relations: ["borrowerPosition", "oracleObservation", "firstLossReserve"];
        },
        {
          name: "borrowerPosition";
          writable: true;
        },
        {
          name: "oracleConfiguration";
          relations: ["market"];
        },
        {
          name: "oracleObservation";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 115, 101, 114, 118, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "firstLossReserve";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 115, 101, 114, 118, 101];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanMint";
        },
        {
          name: "collateralMint";
        },
        {
          name: "liquidatorUsdc";
          writable: true;
        },
        {
          name: "liquidatorCollateral";
          writable: true;
        },
        {
          name: "liquidityVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "collateralVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "reserveVault";
          writable: true;
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanTokenProgram";
        },
        {
          name: "collateralTokenProgram";
        },
      ];
      args: [
        {
          name: "requestedRepay";
          type: "u64";
        },
      ];
    },
    {
      name: "pauseMarket";
      discriminator: [216, 238, 4, 164, 65, 11, 162, 91];
      accounts: [
        {
          name: "creator";
          signer: true;
          relations: ["market"];
        },
        {
          name: "market";
          writable: true;
        },
      ];
      args: [
        {
          name: "paused";
          type: "bool";
        },
      ];
    },
    {
      name: "repayUsdc";
      discriminator: [20, 104, 199, 119, 196, 22, 114, 79];
      accounts: [
        {
          name: "payer";
          signer: true;
        },
        {
          name: "market";
          writable: true;
          relations: ["borrowerPosition"];
        },
        {
          name: "borrowerPosition";
          writable: true;
        },
        {
          name: "loanMint";
        },
        {
          name: "payerUsdc";
          writable: true;
        },
        {
          name: "liquidityVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanTokenProgram";
        },
      ];
      args: [
        {
          name: "requestedAmount";
          type: "u64";
        },
      ];
    },
    {
      name: "submitOracleObservation";
      discriminator: [103, 174, 144, 247, 90, 40, 190, 101];
      accounts: [
        {
          name: "publisher";
          writable: true;
          signer: true;
        },
        {
          name: "market";
          relations: ["oracleConfiguration"];
        },
        {
          name: "oracleConfiguration";
        },
        {
          name: "oracleObservation";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 115, 101, 114, 118, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "price";
          type: "u128";
        },
        {
          name: "confidenceBps";
          type: "u16";
        },
        {
          name: "deviationBps";
          type: "u16";
        },
        {
          name: "maxRecoverableUsdc";
          type: "u64";
        },
        {
          name: "publishedAt";
          type: "i64";
        },
        {
          name: "sequence";
          type: "u64";
        },
      ];
    },
    {
      name: "supplyUsdc";
      discriminator: [178, 205, 86, 31, 58, 45, 54, 199];
      accounts: [
        {
          name: "lender";
          writable: true;
          signer: true;
        },
        {
          name: "market";
          writable: true;
        },
        {
          name: "lenderPosition";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [108, 101, 110, 100, 101, 114];
              },
              {
                kind: "account";
                path: "market";
              },
              {
                kind: "account";
                path: "lender";
              },
            ];
          };
        },
        {
          name: "loanMint";
        },
        {
          name: "lenderUsdc";
          writable: true;
        },
        {
          name: "liquidityVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanTokenProgram";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "withdrawCollateral";
      discriminator: [115, 135, 168, 106, 139, 214, 138, 150];
      accounts: [
        {
          name: "borrower";
          signer: true;
        },
        {
          name: "market";
          relations: ["borrowerPosition", "oracleObservation"];
        },
        {
          name: "borrowerPosition";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 111, 114, 114, 111, 119, 101, 114];
              },
              {
                kind: "account";
                path: "market";
              },
              {
                kind: "account";
                path: "borrower";
              },
            ];
          };
        },
        {
          name: "oracleConfiguration";
          relations: ["market"];
        },
        {
          name: "oracleObservation";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [111, 98, 115, 101, 114, 118, 97, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "collateralMint";
        },
        {
          name: "borrowerCollateral";
          writable: true;
        },
        {
          name: "collateralVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "collateralTokenProgram";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "withdrawUsdc";
      discriminator: [114, 49, 72, 184, 27, 156, 243, 155];
      accounts: [
        {
          name: "lender";
          signer: true;
        },
        {
          name: "market";
          writable: true;
          relations: ["lenderPosition"];
        },
        {
          name: "lenderPosition";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [108, 101, 110, 100, 101, 114];
              },
              {
                kind: "account";
                path: "market";
              },
              {
                kind: "account";
                path: "lender";
              },
            ];
          };
        },
        {
          name: "loanMint";
        },
        {
          name: "lenderUsdc";
          writable: true;
        },
        {
          name: "liquidityVault";
          writable: true;
          relations: ["market"];
        },
        {
          name: "marketAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "market";
              },
            ];
          };
        },
        {
          name: "loanTokenProgram";
        },
      ];
      args: [
        {
          name: "shares";
          type: "u128";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "borrowerPosition";
      discriminator: [22, 15, 23, 98, 200, 151, 249, 66];
    },
    {
      name: "firstLossReserve";
      discriminator: [84, 186, 19, 24, 120, 12, 61, 83];
    },
    {
      name: "globalConfig";
      discriminator: [149, 8, 156, 202, 160, 252, 176, 217];
    },
    {
      name: "lenderPosition";
      discriminator: [165, 98, 244, 204, 209, 158, 88, 19];
    },
    {
      name: "market";
      discriminator: [219, 190, 213, 55, 0, 227, 198, 154];
    },
    {
      name: "marketRewards";
      discriminator: [34, 139, 110, 190, 114, 130, 235, 36];
    },
    {
      name: "oracleConfiguration";
      discriminator: [1, 177, 180, 40, 48, 251, 181, 160];
    },
    {
      name: "oracleObservation";
      discriminator: [176, 75, 202, 9, 47, 238, 222, 254];
    },
  ];
  events: [
    {
      name: "collateralDeposited";
      discriminator: [244, 62, 77, 11, 135, 112, 61, 96];
    },
    {
      name: "collateralWithdrawn";
      discriminator: [51, 224, 133, 106, 74, 173, 72, 82];
    },
    {
      name: "creatorFeesClaimed";
      discriminator: [189, 178, 21, 181, 171, 179, 131, 1];
    },
    {
      name: "firstLossReserveFunded";
      discriminator: [254, 66, 84, 138, 71, 166, 242, 114];
    },
    {
      name: "interestAccrued";
      discriminator: [79, 218, 196, 73, 32, 148, 138, 71];
    },
    {
      name: "lenderRewardsFunded";
      discriminator: [30, 48, 72, 233, 123, 184, 156, 43];
    },
    {
      name: "liquiditySupplied";
      discriminator: [31, 41, 157, 195, 234, 245, 107, 235];
    },
    {
      name: "liquidityWithdrawn";
      discriminator: [240, 120, 73, 139, 154, 31, 218, 68];
    },
    {
      name: "marketCreated";
      discriminator: [88, 184, 130, 231, 226, 84, 6, 58];
    },
    {
      name: "marketPauseChanged";
      discriminator: [201, 237, 60, 219, 84, 169, 111, 59];
    },
    {
      name: "oracleObserved";
      discriminator: [251, 25, 221, 41, 50, 211, 179, 216];
    },
    {
      name: "positionLiquidated";
      discriminator: [40, 107, 90, 214, 96, 30, 61, 128];
    },
    {
      name: "protocolInitialized";
      discriminator: [173, 122, 168, 254, 9, 118, 76, 132];
    },
    {
      name: "usdcBorrowed";
      discriminator: [0, 201, 119, 117, 182, 167, 64, 55];
    },
    {
      name: "usdcRepaid";
      discriminator: [13, 43, 238, 20, 238, 67, 97, 157];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "invalidParameter";
      msg: "The supplied parameter is outside the approved range";
    },
    {
      code: 6001;
      name: "marketMismatch";
      msg: "The account does not belong to this market";
    },
    {
      code: 6002;
      name: "unsupportedToken";
      msg: "The token mint or token program is not approved";
    },
    {
      code: 6003;
      name: "invalidOracle";
      msg: "The oracle configuration is invalid or unavailable";
    },
    {
      code: 6004;
      name: "mathOverflow";
      msg: "The requested operation would overflow";
    },
    {
      code: 6005;
      name: "paused";
      msg: "The protocol or market has paused this action";
    },
    {
      code: 6006;
      name: "unauthorized";
      msg: "Only the configured authority may perform this action";
    },
    {
      code: 6007;
      name: "invalidConfigHash";
      msg: "The immutable market configuration does not match its hash";
    },
    {
      code: 6008;
      name: "invalidVault";
      msg: "The vault is not the canonical vault for this market";
    },
    {
      code: 6009;
      name: "oracleUnavailable";
      msg: "A risk-increasing action requires a fresh oracle observation";
    },
    {
      code: 6010;
      name: "amountTooSmall";
      msg: "The operation would create a zero-value position";
    },
    {
      code: 6011;
      name: "insufficientLiquidity";
      msg: "The requested amount is not available";
    },
    {
      code: 6012;
      name: "unhealthyPosition";
      msg: "The resulting borrower position would be unhealthy";
    },
    {
      code: 6013;
      name: "positionHealthy";
      msg: "The borrower position is not liquidatable";
    },
    {
      code: 6014;
      name: "excessiveFees";
      msg: "Fees cannot exceed accrued interest";
    },
    {
      code: 6015;
      name: "unsupportedTokenExtension";
      msg: "The mint uses a Token-2022 extension unsupported by this market";
    },
  ];
  types: [
    {
      name: "borrowerPosition";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "owner";
            type: "pubkey";
          },
          {
            name: "collateralAmount";
            type: "u64";
          },
          {
            name: "borrowShares";
            type: "u128";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "collateralDeposited";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "borrower";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "collateralWithdrawn";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "borrower";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "createMarketArgs";
      type: {
        kind: "struct";
        fields: [
          {
            name: "configHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "lltvBps";
            type: "u16";
          },
          {
            name: "liquidationBonusBps";
            type: "u16";
          },
          {
            name: "closeFactorBps";
            type: "u16";
          },
          {
            name: "creatorFeeBps";
            type: "u16";
          },
          {
            name: "protocolFeeBps";
            type: "u16";
          },
          {
            name: "rateModel";
            type: {
              defined: {
                name: "interestRateModel";
              };
            };
          },
          {
            name: "marketBorrowCap";
            type: "u64";
          },
          {
            name: "walletBorrowCap";
            type: "u64";
          },
          {
            name: "oracleKind";
            type: {
              defined: {
                name: "oracleKind";
              };
            };
          },
          {
            name: "oracleMaxAgeSeconds";
            type: "u32";
          },
          {
            name: "oracleMaxConfidenceBps";
            type: "u16";
          },
          {
            name: "oracleMaxDeviationBps";
            type: "u16";
          },
          {
            name: "oraclePriceDecimals";
            type: "u8";
          },
          {
            name: "oracleSources";
            type: {
              vec: "pubkey";
            };
          },
        ];
      };
    },
    {
      name: "creatorFeesClaimed";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "creator";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "firstLossReserve";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "vault";
            type: "pubkey";
          },
          {
            name: "deposited";
            type: "u64";
          },
          {
            name: "absorbedLosses";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "firstLossReserveFunded";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "contributor";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "globalConfig";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "pendingAuthority";
            type: "pubkey";
          },
          {
            name: "approvedLoanMint";
            type: "pubkey";
          },
          {
            name: "protocolFeeRecipient";
            type: "pubkey";
          },
          {
            name: "marketCount";
            type: "u64";
          },
          {
            name: "maxOracleAgeSeconds";
            type: "u32";
          },
          {
            name: "paused";
            type: "bool";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "interestAccrued";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "interest";
            type: "u64";
          },
          {
            name: "borrowIndex";
            type: "u128";
          },
        ];
      };
    },
    {
      name: "interestRateModel";
      type: {
        kind: "struct";
        fields: [
          {
            name: "baseRate";
            type: "u64";
          },
          {
            name: "targetUtilizationBps";
            type: "u16";
          },
          {
            name: "slopeLow";
            type: "u64";
          },
          {
            name: "slopeHigh";
            type: "u64";
          },
          {
            name: "maxBorrowRate";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "lenderPosition";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "owner";
            type: "pubkey";
          },
          {
            name: "supplyShares";
            type: "u128";
          },
          {
            name: "rewardIndexCheckpoint";
            type: "u128";
          },
          {
            name: "rewardOwed";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "lenderRewardsFunded";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "funder";
            type: "pubkey";
          },
          {
            name: "rewardMint";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "liquiditySupplied";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "lender";
            type: "pubkey";
          },
          {
            name: "assets";
            type: "u64";
          },
          {
            name: "shares";
            type: "u128";
          },
        ];
      };
    },
    {
      name: "liquidityWithdrawn";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "lender";
            type: "pubkey";
          },
          {
            name: "assets";
            type: "u64";
          },
          {
            name: "shares";
            type: "u128";
          },
        ];
      };
    },
    {
      name: "market";
      type: {
        kind: "struct";
        fields: [
          {
            name: "globalConfig";
            type: "pubkey";
          },
          {
            name: "creator";
            type: "pubkey";
          },
          {
            name: "collateralMint";
            type: "pubkey";
          },
          {
            name: "loanMint";
            type: "pubkey";
          },
          {
            name: "collateralTokenProgram";
            type: "pubkey";
          },
          {
            name: "loanTokenProgram";
            type: "pubkey";
          },
          {
            name: "liquidityVault";
            type: "pubkey";
          },
          {
            name: "collateralVault";
            type: "pubkey";
          },
          {
            name: "oracleConfiguration";
            type: "pubkey";
          },
          {
            name: "configHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "lltvBps";
            type: "u16";
          },
          {
            name: "liquidationBonusBps";
            type: "u16";
          },
          {
            name: "closeFactorBps";
            type: "u16";
          },
          {
            name: "creatorFeeBps";
            type: "u16";
          },
          {
            name: "protocolFeeBps";
            type: "u16";
          },
          {
            name: "rateModel";
            type: {
              defined: {
                name: "interestRateModel";
              };
            };
          },
          {
            name: "marketBorrowCap";
            type: "u64";
          },
          {
            name: "walletBorrowCap";
            type: "u64";
          },
          {
            name: "totalSupplyShares";
            type: "u128";
          },
          {
            name: "totalBorrowShares";
            type: "u128";
          },
          {
            name: "borrowIndex";
            type: "u128";
          },
          {
            name: "totalDebt";
            type: "u128";
          },
          {
            name: "badDebt";
            type: "u64";
          },
          {
            name: "creatorFeesClaimable";
            type: "u64";
          },
          {
            name: "protocolFeesClaimable";
            type: "u64";
          },
          {
            name: "lastAccrualTimestamp";
            type: "i64";
          },
          {
            name: "borrowingPaused";
            type: "bool";
          },
          {
            name: "bump";
            type: "u8";
          },
          {
            name: "authorityBump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "marketCreated";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "creator";
            type: "pubkey";
          },
          {
            name: "collateralMint";
            type: "pubkey";
          },
          {
            name: "loanMint";
            type: "pubkey";
          },
          {
            name: "configHash";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "customOracleHighRisk";
            type: "bool";
          },
        ];
      };
    },
    {
      name: "marketPauseChanged";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "borrowingPaused";
            type: "bool";
          },
        ];
      };
    },
    {
      name: "marketRewards";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "rewardMint";
            type: "pubkey";
          },
          {
            name: "rewardVault";
            type: "pubkey";
          },
          {
            name: "rewardIndex";
            type: "u128";
          },
          {
            name: "undistributedRewards";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "oracleConfiguration";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "kind";
            type: {
              defined: {
                name: "oracleKind";
              };
            };
          },
          {
            name: "collateralMint";
            type: "pubkey";
          },
          {
            name: "loanMint";
            type: "pubkey";
          },
          {
            name: "maxAgeSeconds";
            type: "u32";
          },
          {
            name: "maxConfidenceBps";
            type: "u16";
          },
          {
            name: "maxDeviationBps";
            type: "u16";
          },
          {
            name: "priceDecimals";
            type: "u8";
          },
          {
            name: "sourceCount";
            type: "u8";
          },
          {
            name: "sources";
            type: {
              vec: "pubkey";
            };
          },
          {
            name: "customHighRisk";
            type: "bool";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "oracleKind";
      type: {
        kind: "enum";
        variants: [
          {
            name: "pyth";
          },
          {
            name: "switchboard";
          },
          {
            name: "dexTwap";
          },
          {
            name: "aggregatedPools";
          },
          {
            name: "custom";
          },
        ];
      };
    },
    {
      name: "oracleObservation";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "publisher";
            type: "pubkey";
          },
          {
            name: "price";
            type: "u128";
          },
          {
            name: "confidenceBps";
            type: "u16";
          },
          {
            name: "deviationBps";
            type: "u16";
          },
          {
            name: "maxRecoverableUsdc";
            type: "u64";
          },
          {
            name: "publishedAt";
            type: "i64";
          },
          {
            name: "sequence";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "oracleObserved";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "publisher";
            type: "pubkey";
          },
          {
            name: "price";
            type: "u128";
          },
          {
            name: "maxRecoverableUsdc";
            type: "u64";
          },
          {
            name: "publishedAt";
            type: "i64";
          },
          {
            name: "sequence";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "positionLiquidated";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "borrower";
            type: "pubkey";
          },
          {
            name: "liquidator";
            type: "pubkey";
          },
          {
            name: "repaid";
            type: "u64";
          },
          {
            name: "collateralSeized";
            type: "u64";
          },
          {
            name: "badDebt";
            type: "u64";
          },
          {
            name: "reserveAbsorbed";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "protocolInitialized";
      type: {
        kind: "struct";
        fields: [
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "loanMint";
            type: "pubkey";
          },
        ];
      };
    },
    {
      name: "usdcBorrowed";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "borrower";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "debtShares";
            type: "u128";
          },
        ];
      };
    },
    {
      name: "usdcRepaid";
      type: {
        kind: "struct";
        fields: [
          {
            name: "market";
            type: "pubkey";
          },
          {
            name: "payer";
            type: "pubkey";
          },
          {
            name: "borrower";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "debtShares";
            type: "u128";
          },
        ];
      };
    },
  ];
};
