import * as anchor from "@coral-xyz/anchor";
import { AnchorError, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";

describe("tip_jar", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Use workspace (loaded by Anchor from target/types after `anchor build`)
  const program = anchor.workspace.TipJar as anchor.Program;

  // Test wallets
  const authority = provider.wallet as anchor.Wallet;
  const feeReceiver = Keypair.generate();
  const creator = Keypair.generate();
  const supporter = Keypair.generate();
  const unauthorized = Keypair.generate();

  const PLATFORM_FEE_BPS = 250; // 2.5%

  // Derive PDAs
  const [platformConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform_config")],
    program.programId
  );
  const [tipJarPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("tip_jar"), creator.publicKey.toBuffer()],
    program.programId
  );

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function airdrop(pubkey: PublicKey, sol: number) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function getBalance(pubkey: PublicKey): Promise<number> {
    return provider.connection.getBalance(pubkey);
  }

  // ─── Setup ─────────────────────────────────────────────────────────────────

  before(async () => {
    await Promise.all([
      airdrop(creator.publicKey, 10),
      airdrop(supporter.publicKey, 10),
      airdrop(unauthorized.publicKey, 2),
      airdrop(feeReceiver.publicKey, 0.1),
    ]);
  });

  // ─── initialize_platform ───────────────────────────────────────────────────

  describe("initialize_platform", () => {
    it("creates platform config with correct state", async () => {
      await program.methods
        .initializePlatform(PLATFORM_FEE_BPS)
        .accounts({
          authority: authority.publicKey,
          feeReceiver: feeReceiver.publicKey,
          platformConfig: platformConfigPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const config = await program.account.platformConfig.fetch(
        platformConfigPDA
      );
      assert.equal(
        config.authority.toBase58(),
        authority.publicKey.toBase58(),
        "wrong authority"
      );
      assert.equal(
        config.feeReceiver.toBase58(),
        feeReceiver.publicKey.toBase58(),
        "wrong fee receiver"
      );
      assert.equal(config.feeBps, PLATFORM_FEE_BPS, "wrong fee bps");
    });
  });

  // ─── create_tip_jar ────────────────────────────────────────────────────────

  describe("create_tip_jar", () => {
    it("creates tip jar with correct state", async () => {
      const creatorName = "Alice The Creator";

      await program.methods
        .createTipJar(creatorName)
        .accounts({
          creator: creator.publicKey,
          tipJar: tipJarPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const tipJar = await program.account.tipJar.fetch(tipJarPDA);
      assert.equal(
        tipJar.creator.toBase58(),
        creator.publicKey.toBase58(),
        "wrong creator"
      );
      assert.equal(tipJar.name, creatorName, "wrong name");
      assert.equal(
        (tipJar.totalTipsReceived as BN).toNumber(),
        0,
        "initial tips should be 0"
      );
    });
  });

  // ─── send_tip ──────────────────────────────────────────────────────────────

  describe("send_tip", () => {
    const TIP_LAMPORTS = LAMPORTS_PER_SOL; // 1 SOL

    it("routes creator share and platform fee correctly", async () => {
      const creatorBefore = await getBalance(creator.publicKey);
      const feeBefore = await getBalance(feeReceiver.publicKey);

      const tx = await program.methods
        .sendTip(new BN(TIP_LAMPORTS))
        .accounts({
          supporter: supporter.publicKey,
          creator: creator.publicKey,
          tipJar: tipJarPDA,
          platformConfig: platformConfigPDA,
          feeReceiver: feeReceiver.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([supporter])
        .rpc();

      console.log("    Tip tx:", tx);

      const expectedFee = Math.floor(
        (TIP_LAMPORTS * PLATFORM_FEE_BPS) / 10_000
      );
      const expectedCreator = TIP_LAMPORTS - expectedFee;

      const creatorAfter = await getBalance(creator.publicKey);
      const feeAfter = await getBalance(feeReceiver.publicKey);

      assert.equal(
        creatorAfter - creatorBefore,
        expectedCreator,
        "creator received wrong amount"
      );
      assert.equal(
        feeAfter - feeBefore,
        expectedFee,
        "fee receiver got wrong amount"
      );
    });

    it("updates total_tips_received on tip jar", async () => {
      const tipJar = await program.account.tipJar.fetch(tipJarPDA);
      assert.equal(
        (tipJar.totalTipsReceived as BN).toNumber(),
        TIP_LAMPORTS,
        "total tips not updated"
      );
    });

    it("accumulates tips across multiple transactions", async () => {
      const before = await program.account.tipJar.fetch(tipJarPDA);
      const prevTotal = (before.totalTipsReceived as BN).toNumber();

      const secondTip = 0.5 * LAMPORTS_PER_SOL;
      await program.methods
        .sendTip(new BN(secondTip))
        .accounts({
          supporter: supporter.publicKey,
          creator: creator.publicKey,
          tipJar: tipJarPDA,
          platformConfig: platformConfigPDA,
          feeReceiver: feeReceiver.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([supporter])
        .rpc();

      const after = await program.account.tipJar.fetch(tipJarPDA);
      assert.equal(
        (after.totalTipsReceived as BN).toNumber(),
        prevTotal + secondTip,
        "accumulated total wrong"
      );
    });

    it("deducts correct total from supporter", async () => {
      const tipAmount = 0.25 * LAMPORTS_PER_SOL;
      const supporterBefore = await getBalance(supporter.publicKey);

      await program.methods
        .sendTip(new BN(tipAmount))
        .accounts({
          supporter: supporter.publicKey,
          creator: creator.publicKey,
          tipJar: tipJarPDA,
          platformConfig: platformConfigPDA,
          feeReceiver: feeReceiver.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([supporter])
        .rpc();

      const supporterAfter = await getBalance(supporter.publicKey);
      const deducted = supporterBefore - supporterAfter;
      // Supporter should lose tipAmount plus a small tx fee (~5000 lamports)
      assert.isAbove(deducted, tipAmount - 10_000, "deducted too little");
      assert.isBelow(deducted, tipAmount + 20_000, "deducted too much");
    });

    it("rejects a zero-amount tip", async () => {
      try {
        await program.methods
          .sendTip(new BN(0))
          .accounts({
            supporter: supporter.publicKey,
            creator: creator.publicKey,
            tipJar: tipJarPDA,
            platformConfig: platformConfigPDA,
            feeReceiver: feeReceiver.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([supporter])
          .rpc();
        assert.fail("should have thrown");
      } catch (err) {
        const e = err as AnchorError;
        assert.equal(e.error?.errorCode?.code, "InvalidAmount");
      }
    });
  });

  // ─── update_platform_fee ───────────────────────────────────────────────────

  describe("update_platform_fee", () => {
    it("allows authority to raise the fee", async () => {
      await program.methods
        .updatePlatformFee(300)
        .accounts({
          authority: authority.publicKey,
          platformConfig: platformConfigPDA,
        })
        .rpc();

      const config = await program.account.platformConfig.fetch(
        platformConfigPDA
      );
      assert.equal(config.feeBps, 300);
    });

    it("allows setting fee to exactly 1000 bps (max cap)", async () => {
      await program.methods
        .updatePlatformFee(1000)
        .accounts({
          authority: authority.publicKey,
          platformConfig: platformConfigPDA,
        })
        .rpc();

      const config = await program.account.platformConfig.fetch(
        platformConfigPDA
      );
      assert.equal(config.feeBps, 1000);
    });

    it("rejects fee above 1000 bps", async () => {
      try {
        await program.methods
          .updatePlatformFee(1001)
          .accounts({
            authority: authority.publicKey,
            platformConfig: platformConfigPDA,
          })
          .rpc();
        assert.fail("should have thrown");
      } catch (err) {
        const e = err as AnchorError;
        assert.equal(e.error?.errorCode?.code, "FeeTooHigh");
      }
    });

    it("rejects unauthorized caller", async () => {
      try {
        await program.methods
          .updatePlatformFee(100)
          .accounts({
            authority: unauthorized.publicKey,
            platformConfig: platformConfigPDA,
          })
          .signers([unauthorized])
          .rpc();
        assert.fail("should have thrown");
      } catch (err) {
        const e = err as AnchorError;
        // Anchor emits a ConstraintRaw error (2003) when a raw constraint fails
        assert.ok(
          e.error?.errorCode?.code === "Unauthorized" ||
            e.error?.errorCode?.number === 2003,
          `unexpected error: ${JSON.stringify(e.error?.errorCode)}`
        );
      }
    });

    it("restores fee to original value", async () => {
      await program.methods
        .updatePlatformFee(PLATFORM_FEE_BPS)
        .accounts({
          authority: authority.publicKey,
          platformConfig: platformConfigPDA,
        })
        .rpc();

      const config = await program.account.platformConfig.fetch(
        platformConfigPDA
      );
      assert.equal(config.feeBps, PLATFORM_FEE_BPS);
    });
  });
});
