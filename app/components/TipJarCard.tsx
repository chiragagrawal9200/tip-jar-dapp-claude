import React, { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getProgram } from "../utils/program";
import { getPlatformConfigPDA, getTipJarPDA, shortKey, lamportsToSol } from "../utils/pdas";

export interface TipJarData {
  publicKey: string;
  creator: string;
  name: string;
  totalTipsReceived: number;
  bump: number;
}

interface TipJarCardProps {
  jar: TipJarData;
  platformFeeReceiver: string;
  onTipSuccess?: (jar: TipJarData, newTotal: number) => void;
}

export default function TipJarCard({
  jar,
  platformFeeReceiver,
  onTipSuccess,
}: TipJarCardProps) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const explorerBase =
    process.env.NEXT_PUBLIC_EXPLORER_BASE ??
    "https://explorer.solana.com/tx";
  const explorerCluster =
    process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ?? "?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899";

  async function handleTip() {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    const amountSol = parseFloat(amount);
    if (isNaN(amountSol) || amountSol <= 0) {
      setError("Enter a valid SOL amount greater than 0.");
      return;
    }

    setLoading(true);
    setError(null);
    setTxSig(null);

    try {
      const program = getProgram(
        wallet as Parameters<typeof getProgram>[0],
        connection
      );

      const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
      const [platformConfigPDA] = getPlatformConfigPDA();
      const [tipJarPDA] = getTipJarPDA(
        new (await import("@solana/web3.js")).PublicKey(jar.creator)
      );

      const sig = await program.methods
        .sendTip(new BN(lamports))
        .accounts({
          supporter: wallet.publicKey,
          creator: jar.creator,
          tipJar: tipJarPDA,
          platformConfig: platformConfigPDA,
          feeReceiver: platformFeeReceiver,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxSig(sig);
      setAmount("");
      setOpen(false);
      onTipSuccess?.(jar, jar.totalTipsReceived + lamports);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 200 ? msg.slice(0, 200) + "…" : msg);
    } finally {
      setLoading(false);
    }
  }

  const isSelf =
    wallet.publicKey?.toBase58() === jar.creator;

  return (
    <div className="tip-jar-card">
      <div className="tip-jar-name">{jar.name}</div>
      <div className="tip-jar-creator" title={jar.creator}>
        {shortKey(jar.creator, 8)}
      </div>

      <div className="tip-jar-total">
        <span>💰</span>
        <span>{lamportsToSol(jar.totalTipsReceived)}</span>
        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
          total received
        </span>
      </div>

      {txSig && (
        <div className="alert alert-success" style={{ marginBottom: "0.75rem" }}>
          Tip sent! 🎉
          <div className="tx-hash" style={{ marginTop: "0.3rem" }}>
            <a
              href={`${explorerBase}/${txSig}${explorerCluster}`}
              target="_blank"
              rel="noreferrer"
            >
              {txSig.slice(0, 20)}…{txSig.slice(-8)}
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}

      {!wallet.connected ? (
        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Connect wallet to send a tip
        </div>
      ) : (

        <>
          {!open && (
            <button
              className="tip-form-toggle"
              onClick={() => {
                setOpen(true);
                setError(null);
                setTxSig(null);
              }}
            >
              + Send a tip
            </button>
          )}
          {open && (
            <div className="tip-form-inner">
              <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                <label className="form-label">Amount (SOL)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0.000001"
                  step="0.01"
                  placeholder="0.1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-accent btn-sm"
                  onClick={handleTip}
                  disabled={loading || !amount}
                  style={{ flex: 1 }}
                >
                  {loading ? <span className="spinner" /> : "Send Tip ✨"}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
