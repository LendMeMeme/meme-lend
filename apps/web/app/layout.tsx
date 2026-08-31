import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import { WalletContext } from "@/components/wallet-context";
import { WalletControl } from "@/components/wallet-control";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: { default: "Meme Lend", template: "%s · Meme Lend" },
  description: "Create isolated USDC lending markets for memecoin collateral on Solana.",
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d0c" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f2" },
  ],
  colorScheme: "dark light",
};
const links = [
  ["Markets", "/markets"],
  ["Create", "/create-market"],
  ["Positions", "/positions"],
  ["Liquidations", "/liquidations"],
  ["Docs", "/docs"],
];
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("meme-lend-theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}',
          }}
        />
      </head>
      <body>
        <WalletContext>
          <header className="shell nav">
            <Link className="brand" href="/">
              <span className="brand-mark">
                <Image src="/lend-logo.png" alt="" width={30} height={30} priority />
              </span>
              Meme Lend
            </Link>
            <nav className="nav-links" aria-label="Primary">
              {links.map(([label, href]) => (
                <Link href={href} key={href}>
                  {label}
                </Link>
              ))}
            </nav>
            <div className="nav-actions">
              <ThemeToggle />
              <WalletControl />
            </div>
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
