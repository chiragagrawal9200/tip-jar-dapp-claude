import React, { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getReadonlyProgram, PROGRAM_ID } from "../utils/program";
import { getPlatformConfigPDA } from "../utils/pdas";
import TipJarCard, { TipJarData } from "../components/TipJarCard";

export default function TipJarsPage() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [jars, setJars] = useState<TipJarData[]>([]);
  const [platformFeeReceiver, setPlatformFeeReceiver] = useState<string | null>(null);
  const [platformFeeBps, setPlatformFeeBps] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const program = getReadonlyProgram(connection);

      // Fetch platform config
      const [platformConfigPDA] = getPlatformConfigPDA();
      try {
        const config = await program.account.platformConfig.fetch(
          platformConfigPDA
        );
        setPlatformFeeReceiver((config.feeReceiver as PublicKey).toBase58());
        setPlatformFeeBps(config.feeBps as number);
      } catch {
        setError(
          "Platform not initialized. Run initialize_platform first (see README)."
        );
        setLoading(false);
        return;
      }

      // Fetch all tip jar accounts (uses the discriminator to filter by type)
      const accounts = await program.account.tipJar.all();

      const parsed: TipJarData[] = accounts.map((a) => ({
        publicKey: a.publicKey.toBase58(),
        creator: (a.account.creator as PublicKey).toBase58(),
        name: a.account.name as string,
        totalTipsReceived: (a.account.totalTipsReceived as BN).toNumber(),
        bump: a.account.bump as number,
      }));

      // Sort by total tips descending
      parsed.sort((a, b) => b.totalTipsReceived - a.totalTipsReceived);
      setJars(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleTipSuccess(jar: TipJarData, newTotal: number) {
    setJars((prev) =>
      prev
        .map((j) =>
          j.publicKey === jar.publicKey
            ? { ...j, totalTipsReceived: newTotal }
            : j
        )
        .sort((a, b) => b.totalTipsReceived - a.totalTipsReceived)
    );
  }

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Tip Jars</h1>
          <p className="page-subtitle">
            Browse all on-chain tip jars and send SOL directly to creators.
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={fetchData}
          disabled={loading}
        >
          {loading ? <span className="spinner" style={{ borderTopColor: "var(--text)" }} /> : "↻ Refresh"}
        </button>
      </div>

      {/* Platform info banner */}
      {platformFeeBps !== null && (
        <div
          className="card"
          style={{
            marginBottom: "1.5rem",
            display: "flex",
            gap: "2rem",
            flexWrap: "wrap",
            fontSize: "0.88rem",
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)" }}>Program ID: </span>
            <code style={{ color: "var(--accent2)", fontSize: "0.82rem" }}>
              {PROGRAM_ID.toBase58().slice(0, 16)}…
            </code>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Platform fee: </span>
            <strong>{(platformFeeBps / 100).toFixed(2)}%</strong>{" "}
            <span style={{ color: "var(--text-muted)" }}>({platformFeeBps} bps)</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Fee receiver: </span>
            <code style={{ fontSize: "0.82rem" }}>
              {platformFeeReceiver?.slice(0, 8)}…{platformFeeReceiver?.slice(-6)}
            </code>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Total jars: </span>
            <strong>{jars.length}</strong>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="empty-state">
          <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, borderTopColor: "var(--accent)" }} />
          <p style={{ marginTop: "1rem", color: "var(--text-muted)" }}>Loading tip jars…</p>
        </div>
      )}

      {!loading && !error && jars.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🫙</div>
          <h3>No tip jars yet</h3>
          <p style={{ marginBottom: "1.5rem" }}>
            Be the first creator to set one up!
          </p>
          <a href="/create" className="btn btn-primary btn-sm">
            Create Tip Jar
          </a>
        </div>
      )}

      {!loading && jars.length > 0 && (
        <>
          {!wallet.connected && (
            <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
              Connect your wallet to send tips to creators.
            </div>
          )}
          <div className="card-grid">
            {jars.map((jar) => (
              <TipJarCard
                key={jar.publicKey}
                jar={jar}
                platformFeeReceiver={platformFeeReceiver ?? ""}
                onTipSuccess={handleTipSuccess}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
