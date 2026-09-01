import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletContext } from "@/components/wallet-context";
import { WalletControl } from "@/components/wallet-control";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: { default: "Lend Meme Loans", template: "%s · Lend Meme Loans" },
  description: "Create isolated USDC lending markets for memecoin collateral on Solana.",
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#030504" },
    { media: "(prefers-color-scheme: light)", color: "#f8faf8" },
  ],
  colorScheme: "light dark",
};
const links = [
  ["Markets", "/markets"],
  ["My dashboard", "/positions"],
  ["Create a market", "/create-market"],
  ["Liquidations", "/liquidations"],
  ["Docs", "/docs"],
];
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("meme-lend-theme");if(t==="dark")document.documentElement.dataset.theme="dark"}catch(e){}',
          }}
        />
      </head>
      <body>
        <WalletContext>
          <header className="site-header">
            <div className="shell nav">
              <Link className="brand" href="/">
                <span className="brand-mark">
                  <Image src="/lend-logo.png" alt="" width={32} height={32} priority />
                </span>
                <span>Lend Meme Loans</span>
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
            </div>
          </header>
          {children}
          <footer className="shell footer">
            <span>Lend or borrow with clear, market-specific terms.</span>
            <span>Built on Solana</span>
          </footer>
        </WalletContext>
      </body>
    </html>
  );
}
