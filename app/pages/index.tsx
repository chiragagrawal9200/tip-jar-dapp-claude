import React from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { shortKey } from "../utils/pdas";
import { NETWORK_LABEL } from "../utils/program";

export default function HomePage() {
  const { publicKey, connected } = useWallet();

  return (
    <div className="page">
      {/* Hero */}
      <section className="hero" style={{ paddingTop: "3rem" }}>
        <div className="hero-title">Creator Tip Jar Protocol</div>
        <p className="hero-subtitle">
          A custom Solana program that lets creators accept SOL tips directly
          on-chain — with transparent platform fees, no middleman.
        </p>

        {connected && publicKey && (
          <div className="alert alert-info" style={{ maxWidth: 480, margin: "0 auto 1.5rem", textAlign: "left" }}>
            Connected: <code style={{ fontSize: "0.85rem" }}>{shortKey(publicKey, 8)}</code>
            <span className="badge badge-green" style={{ marginLeft: "0.5rem" }}>{NETWORK_LABEL}</span>
          </div>
        )}

        <div className="hero-actions">
          <Link href="/create" className="btn btn-primary">
            🫙 Create Tip Jar
          </Link>
          <Link href="/tip-jars" className="btn btn-secondary">
            Browse Jars →
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">🔐</div>
            <div className="feature-title">Custom Anchor Program</div>
            <p className="feature-desc">
              Real on-chain logic in Rust. No Jupiter. No third-party APIs.
              The protocol owns every instruction.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💸</div>
            <div className="feature-title">Transparent Fee Split</div>
            <p className="feature-desc">
              Every tip atomically routes creator share and platform fee in a
              single transaction. Max 10% (1000 bps) fee cap.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🧭</div>
            <div className="feature-title">PDA-Based Identity</div>
            <p className="feature-desc">
              Tip jars are program-derived accounts tied to the creator's
              wallet. One jar per creator, deterministically addressed.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📡</div>
            <div className="feature-title">On-Chain Events</div>
            <p className="feature-desc">
              Every tip emits a <code>TipSent</code> event with supporter,
              creator, gross amount, fee, and timestamp.
            </p>
          </div>
        </div>
      </section>

      {/* Protocol summary */}
      <section style={{ marginTop: "3rem" }}>
        <div className="card">
          <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Protocol Instructions</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>Instruction</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>Who calls it</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>What it does</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["initialize_platform", "Platform authority", "Creates global config PDA with fee bps & fee receiver"],
                ["create_tip_jar", "Creator", "Mints a PDA tip jar account for the creator"],
                ["send_tip", "Supporter", "Splits SOL between creator & fee receiver; updates stats"],
                ["update_platform_fee", "Platform authority", "Adjusts fee bps (max 1000)"],
              ].map(([ix, who, what]) => (
                <tr key={ix} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <code style={{ color: "var(--accent2)", fontSize: "0.82rem" }}>{ix}</code>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "var(--text-muted)" }}>{who}</td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "var(--text-muted)" }}>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
