import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { NETWORK_LABEL } from "../utils/program";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/create", label: "Create Jar" },
    { href: "/tip-jars", label: "Browse Jars" },
  ];

  return (
    <>
      <nav className="navbar">
        <Link href="/" className="navbar-brand">
          🫙 TipJar Protocol
        </Link>
        <div className="navbar-links">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color:
                  router.pathname === link.href ? "var(--text)" : undefined,
                fontWeight: router.pathname === link.href ? 600 : undefined,
              }}
            >
              {link.label}
            </Link>
          ))}
          <span
            className="badge badge-purple"
            style={{ fontSize: "0.7rem" }}
          >
            {NETWORK_LABEL}
          </span>
          <WalletMultiButton />
        </div>
      </nav>
      <main>{children}</main>
    </>
  );
}
