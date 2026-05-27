import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./program";

export const PLATFORM_CONFIG_SEED = "platform_config";
export const TIP_JAR_SEED = "tip_jar";

/** Global platform config PDA (single, shared). */
export function getPlatformConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PLATFORM_CONFIG_SEED)],
    PROGRAM_ID
  );
}

/** Per-creator tip jar PDA. Each creator has exactly one. */
export function getTipJarPDA(creatorPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TIP_JAR_SEED), creatorPubkey.toBuffer()],
    PROGRAM_ID
  );
}

/** Derive tip jar PDA from a base58 creator address string. */
export function getTipJarPDAFromString(creatorAddress: string): [PublicKey, number] {
  return getTipJarPDA(new PublicKey(creatorAddress));
}

/** Shorten a public key for display: "ABC1…XY9Z" */
export function shortKey(pubkey: PublicKey | string, chars = 4): string {
  const str = typeof pubkey === "string" ? pubkey : pubkey.toBase58();
  return `${str.slice(0, chars)}…${str.slice(-chars)}`;
}

/** Lamports → human-readable SOL string, e.g. "1.234 SOL" */
export function lamportsToSol(lamports: number | bigint): string {
  const sol = Number(lamports) / 1_000_000_000;
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`;
}
