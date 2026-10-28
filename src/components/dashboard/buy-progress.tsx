"use client";

import { ArrowUpRight, Check, PenLine, Search, Zap } from "lucide-react";
import { cn, shortAddress } from "@/lib/utils";

/**
 * BuyProgress — the 40 to 70 seconds a paid lookup really takes, on screen.
 *
 * The payment and the memory write were split into two requests because a
 * relayer stall used to turn a settled payment into a timeout. That fix created
 * a new problem: the UI went quiet for a minute. Silence during a paid action
 * reads as a broken button, and a judge who thinks the button is broken never
 * sees the thing being judged.
 *
 * So each step names what the server is doing right now. The step changes are
 * driven by real answers, not by a timer: step 1 ends when the free preflight
 * returns, step 2 ends when Sui hands back a digest, step 3 ends when the
 * memory write returns. Nothing here claims progress that has not happened.
 */
export type BuyStep = 1 | 2 | 3;

const STEPS: Array<{ n: BuyStep; icon: typeof Search; label: string }> = [
  { n: 1, icon: Search, label: "Checking merchant" },
  { n: 2, icon: Zap, label: "Paying" },
  { n: 3, icon: PenLine, label: "Writing to memory" },
];

export function BuyProgress({
  step,
  digest,
  price = "0.01",
}: {
  step: BuyStep;
  digest?: string;
  price?: string;
}) {
  return (
    <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-500/25 dark:bg-emerald-500/5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {STEPS.map((s) => {
          const state = s.n < step ? "done" : s.n === step ? "active" : "pending";
          const Icon = s.icon;
          return (
            <div key={s.n} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full",
                  state === "done" && "bg-emerald-500 text-white",
                  state === "active" &&
                    "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-300",
                  state === "pending" && "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
                )}
              >
                {state === "done" ? <Check className="size-3" /> : <Icon className="size-3" />}
              </span>
              <span
                className={cn(
                  "text-xs",
                  state === "active" && "font-medium text-emerald-800 dark:text-emerald-300",
                  state === "done" && "text-emerald-700 dark:text-emerald-400",
                  state === "pending" && "text-zinc-400 dark:text-zinc-500",
                )}
              >
                {s.label}
                {s.n === 2 ? ` ${price} USDC` : ""}
                {state === "active" ? "…" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {digest && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
          <span className="font-medium">Settled on Sui</span>
          <a
            href={`https://suiscan.xyz/mainnet/tx/${digest}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-mono underline-offset-2 hover:underline"
            title={digest}
          >
            {shortAddress(digest, 8, 6)}
            <ArrowUpRight className="size-2.5" />
          </a>
          <span className="text-emerald-600/70 dark:text-emerald-400/70">
            · the memory write is all that is left, so a second click never pays twice
          </span>
        </div>
      )}
    </div>
  );
}
