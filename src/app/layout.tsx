import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "GM Scraper",
  description: "Google Maps business scraper",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 h-12 flex items-center gap-6">
            <Link href="/" className="font-semibold text-foreground hover:text-primary transition-colors">
              GM Scraper
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <Link href="/businesses" className="text-muted-foreground hover:text-foreground transition-colors">
                Businesses
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
