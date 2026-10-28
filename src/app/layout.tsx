import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallSpend — spending memory on Walrus",
  description:
    "A Sui spending dashboard whose ledger, merchant rules and budgets live in Walrus Memory on mainnet. Correct a merchant once and it stays corrected on every device.",
};

/**
 * Applies the stored theme before the first paint.
 *
 * This has to be a blocking inline script: React runs after paint, so anything
 * else means the page flashes white for a dark-mode user on every navigation.
 */
const themeScript = `
(function(){
  try {
    var saved = localStorage.getItem('recallspend-theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
