import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { WalletContext } from "@/components/wallet-context";
import { WalletControl } from "@/components/wallet-control";

export const metadata: Metadata = {
  title: { default: "Meme Lend", template: "%s · Meme Lend" },
  description: "Create isolated USDC lending markets for memecoin collateral on Solana.",
};
export const viewport: Viewport = { themeColor: "#f7f7f2", colorScheme: "light" };
const links = [
  ["Markets", "/markets"],
  ["Create", "/create-market"],
  ["Positions", "/positions"],
  ["Liquidations", "/liquidations"],
  ["Docs", "/docs"],
];
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WalletContext>
          <header className="shell nav">
            <Link className="brand" href="/">
              <span className="brand-mark">M</span>Meme Lend
            </Link>
            <nav className="nav-links" aria-label="Primary">
              {links.map(([label, href]) => (
                <Link href={href} key={href}>
                  {label}
                </Link>
              ))}
            </nav>
            <WalletControl />
          </header>
          {children}
          <footer className="shell footer">
            <span>Permissionless markets. Isolated risk.</span>
            <span>Built on Solana</span>
          </footer>
        </WalletContext>
      </body>
    </html>
  );
}
