import React, { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);
import { SystemProgram } from "@solana/web3.js";
import { getProgram } from "../utils/program";
import { getTipJarPDA, shortKey } from "../utils/pdas";

type Status = "idle" | "loading" | "success" | "error";

export default function CreatePage() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [txSig, setTxSig] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [existingJar, setExistingJar] = useState<boolean | null>(null);

  const explorerBase =
    process.env.NEXT_PUBLIC_EXPLORER_BASE ?? "https://explorer.solana.com/tx";
  const explorerCluster =
    process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ??
    "?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899";

  // Check if creator already has a tip jar
  useEffect(() => {
    if (!wallet.publicKey) {
      setExistingJar(null);
      return;
    }
    const [tipJarPDA] = getTipJarPDA(wallet.publicKey);
    connection.getAccountInfo(tipJarPDA).then((info) => {
      setExistingJar(info !== null);
    });
  }, [wallet.publicKey, connection]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;

    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) {
      setErrorMsg("Name must be 1–50 characters.");
      return;
    }

    setStatus("loading");
    setErrorMsg(null);
    setTxSig(null);

    try {
      const program = getProgram(
        wallet as Parameters<typeof getProgram>[0],
        connection
      );

      const [tipJarPDA] = getTipJarPDA(wallet.publicKey);

      const sig = await program.methods
        .createTipJar(trimmed)
        .accounts({
          creator: wallet.publicKey,
          tipJar: tipJarPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxSig(sig);
      setStatus("success");
      setExistingJar(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg.length > 300 ? msg.slice(0, 300) + "…" : msg);
      setStatus("error");
    }
  }

  if (!wallet.connected) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="empty-state-icon">🔌</div>
          <h3>Connect Your Wallet</h3>
          <p style={{ marginBottom: "1.5rem" }}>
            You need a connected wallet to create a tip jar.
          </p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1 className="page-title">Create Tip Jar</h1>
      <p className="page-subtitle">
        Register your creator identity on-chain. One tip jar per wallet.
      </p>

      {wallet.publicKey && (
        <div className="card" style={{ marginBottom: "1.5rem", padding: "0.9rem 1.2rem" }}>
          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Wallet: </span>
          <code style={{ fontSize: "0.85rem" }}>{shortKey(wallet.publicKey, 10)}</code>
          {existingJar === true && (
            <span className="badge badge-green" style={{ marginLeft: "0.75rem" }}>
              Jar exists
            </span>
          )}
          {existingJar === false && (
            <span className="badge badge-purple" style={{ marginLeft: "0.75rem" }}>
              No jar yet
            </span>
          )}
        </div>
      )}

      {existingJar === true && status !== "success" && (
        <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
          You already have a tip jar. Creating again will fail on-chain — each
          wallet can only have one tip jar PDA.
        </div>
      )}

      {status === "success" && txSig && (
        <div className="alert alert-success" style={{ marginBottom: "1.5rem" }}>
          🎉 Tip jar created successfully!
          <div className="tx-hash" style={{ marginTop: "0.4rem" }}>
            Tx:{" "}
            <a
              href={`${explorerBase}/${txSig}${explorerCluster}`}
              target="_blank"
              rel="noreferrer"
            >
              {txSig.slice(0, 24)}…{txSig.slice(-8)}
            </a>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleCreate} className="card">
        <div className="form-group">
          <label className="form-label" htmlFor="creator-name">
            Creator Name
          </label>
          <input
            id="creator-name"
            className="form-input"
            type="text"
            placeholder="e.g. Alice The Creator"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={status === "loading"}
            autoFocus
          />
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
            {name.length}/50 characters
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={status === "loading" || !name.trim()}
        >
          {status === "loading" ? (
            <>
              <span className="spinner" /> Creating…
            </>
          ) : (
            "Create Tip Jar 🫙"
          )}
        </button>
      </form>

      <div style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
        <strong>Under the hood:</strong> This calls{" "}
        <code style={{ color: "var(--accent2)" }}>create_tip_jar</code> on the
        Anchor program. The PDA is seeded with{" "}
        <code>[&quot;tip_jar&quot;, your_wallet]</code> so it&rsquo;s
        deterministic and unique per creator.
      </div>
    </div>
  );
}
