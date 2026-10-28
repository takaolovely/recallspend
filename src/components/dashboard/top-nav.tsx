"use client";

import { Check, Wallet } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { cn, shortAddress } from "@/lib/utils";

export function TopNav({
  wallet,
  connecting,
  onConnect,
}: {
  wallet: string | null;
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
              <path
                d="M4 15.5 9 10l3.5 3.5L20 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              RecallSpend
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-500">
              Sui mainnet · Walrus memory
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {wallet ? (
            <span
              className={cn(
                "hidden items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 sm:inline-flex",
                "dark:border-zinc-800 dark:bg-zinc-900",
              )}
            >
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                {shortAddress(wallet, 6, 6)}
              </span>
            </span>
          ) : (
            <Button size="sm" variant="emerald" onClick={onConnect} disabled={connecting}>
              <Wallet className="size-3.5" />
              Connect wallet
            </Button>
          )}

          {wallet && (
            <Button size="sm" variant="ghost" onClick={onConnect} disabled={connecting}>
              <Check className={cn("size-3.5", connecting && "animate-pulse")} />
              {connecting ? "Syncing" : "Synced"}
            </Button>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
