/**
 * One-time: initialize the platform config on-chain.
 * Run after `anchor deploy`:
 *   cd tip-jar-dapp && npx ts-node scripts/init-platform.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const idl = require("../idl/tip_jar.json");
  const program = new anchor.Program(idl, provider);

  const [platformConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform_config")],
    program.programId
  );

  // Check if already initialized
  const existing = await provider.connection.getAccountInfo(platformConfigPDA);
  if (existing) {
    console.log("✅ Platform already initialized at:", platformConfigPDA.toBase58());
    const config = await (program.account as any).platformConfig.fetch(platformConfigPDA);
    console.log("   fee_bps     :", config.feeBps);
    console.log("   fee_receiver:", (config.feeReceiver as PublicKey).toBase58());
    console.log("   authority   :", (config.authority as PublicKey).toBase58());
    return;
  }

  const FEE_BPS = 250; // 2.5%
  const feeReceiver = provider.wallet.publicKey; // same wallet as fee receiver

  const sig = await program.methods
    .initializePlatform(FEE_BPS)
    .accounts({
      authority: provider.wallet.publicKey,
      feeReceiver,
      platformConfig: platformConfigPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Platform initialized!");
  console.log("   Config PDA  :", platformConfigPDA.toBase58());
  console.log("   Fee         :", FEE_BPS, "bps (2.5%)");
  console.log("   Fee receiver:", feeReceiver.toBase58());
  console.log("   Tx          :", sig);
}

main().catch((err) => {
  console.error("❌ Error:", err.message ?? err);
  process.exit(1);
});
