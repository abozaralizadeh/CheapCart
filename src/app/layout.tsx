import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { loadConfig } from "../lib/config";
import { readAreas } from "../lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "CheapCart (working name)",
  description: "Where to buy each item on your shopping list, close to you, so you pay less.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

function showSampleBanner(): boolean {
  try {
    return readAreas(loadConfig()).some((a) => a.sample);
  } catch {
    return false;
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {showSampleBanner() && (
          <div className="sample-banner" role="note">
            Sample data. Every shop and price here is made up. Do not use these results to shop.
          </div>
        )}
        <header className="site">
          <Link href="/" className="brand">
            CheapCart <span className="muted">(working name)</span>
          </Link>
          <nav aria-label="Main">
            <Link href="/">Your list</Link>
            <Link href="/submit">Send prices</Link>
            <Link href="/how-prices-work">How prices work</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site">Prices come from the sources listed on the how prices work page and can be wrong. The shop price always wins.</footer>
      </body>
    </html>
  );
}
