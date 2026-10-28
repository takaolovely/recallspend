import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallSpend — spending memory that outlives the app",
  description:
    "A Sui spend tracker whose ledger, merchant rules and budgets live in Walrus Memory on mainnet. Correct a merchant once and it stays corrected, on every device, forever.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
