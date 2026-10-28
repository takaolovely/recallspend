import { Sparkles, UserRound, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryMeta } from "./category-meta";
import { cn, formatAmount, formatDate, formatTime, pct, shortAddress } from "@/lib/utils";
import type { SpendRow as Row } from "@/lib/types";

/**
 * TransactionRow.
 *
 * Four states matter visually and must not look alike:
 *   - nothing special: a category, quietly
 *   - needs a label:  an address we cannot name, with the action to fix it
 *   - learned:        the app applied a rule it was taught (emerald, small)
 *   - paid:           the label was bought from the seller for 0.01 USDC
 *
 * "Learned" and "paid" are both stated in words, not only in colour, because a
 * colour-only signal is invisible to a third of the people reading it. The two
 * are different claims: one says "you taught me", the other says "I bought this
 * fact and here is the transaction".
 *
 * A fee is neither: nobody taught the app that gas is gas, it follows from the
 * transaction itself. Marking fees as learned made every row look trained and
 * quietly devalued the one badge that is supposed to mean something.
 */
export function TransactionRow({
  row,
  busy,
  buying,
  stage,
  pausedReason,
  onBuy,
  onCorrect,
}: {
  row: Row;
  busy: boolean;
  buying: boolean;
  /** 1 checking, 2 paying, 3 writing — the button says which one, not just "Paying…". */
  stage?: 1 | 2 | 3 | null;
  /** Set when the agent reserve floor is reached, so the button explains itself. */
  pausedReason?: string | null;
  onBuy: (row: Row) => void;
  onCorrect: (row: Row) => void;
}) {
  const meta = categoryMeta(row.category);
  const Icon = meta.icon;
  const isFee = row.to === "—";
  const learned = row.by === "rule" && row.confidence > 0 && !isFee && !row.corrected;
  const paidLookup = Boolean(row.paid);
  const needsLabel = !isFee && !row.corrected && row.category === "Uncategorized";
  const valued = row.corrected || learned || paidLookup;

  return (
    <div className="group flex items-center gap-3 px-4 py-4 transition-colors duration-150 ease-[var(--ease-out)] hover:bg-zinc-50/80 sm:gap-4 sm:px-6 sm:py-5 dark:hover:bg-zinc-800/30">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-zinc-200/70 bg-zinc-50 text-zinc-500 sm:size-10 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {row.label ?? (isFee ? "Network fee" : shortAddress(row.to))}
          </span>
          {row.corrected ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <UserRound className="size-3" />
              you
            </span>
          ) : paidLookup ? (
            row.paid ? (
              <a
                href={`https://suiscan.xyz/mainnet/tx/${row.paid}`}
                target="_blank"
                rel="noreferrer"
                title="This label was bought. Click for the settlement transaction."
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                <Zap className="size-3" />
                paid
              </a>
            ) : (
              <span
                title="Bought before the receipt parser recorded digests, so this line has no proof link."
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
              >
                <Zap className="size-3" />
                paid
              </span>
            )
          ) : learned ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Sparkles className="size-3" />
              learned
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-500">
          <span className="tabular-nums">
            {formatDate(row.at)} · {formatTime(row.at)}
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="truncate font-mono text-[11px]">
            {isFee ? "no counterparty" : shortAddress(row.to, 6, 4)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <Badge variant={valued ? "emerald" : "default"} className="hidden sm:inline-flex">
          <span className={cn("size-1.5 rounded-full", meta.dot)} />
          {row.category}
        </Badge>

        <div className="hidden w-24 text-right sm:block sm:w-28">
          <div className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatAmount(row.amount, row.symbol)}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-500">
            {row.corrected
              ? "you set this"
              : paidLookup
                ? "bought label"
                : learned
                  ? `${pct(row.confidence)} sure`
                  : isFee
                    ? "no rule needed"
                    : "no label yet"}
          </div>
        </div>

        {/* The action a judge needs to find without being told where it is. */}
        {/* Two different things, two different weights. The paid action is solid
            and bold because it spends money; the free action is an outline so it
            reads as the safe, reversible one. */}
        {needsLabel && (
          <Button
            variant="emerald"
            size="sm"
            className="font-semibold shadow-sm shadow-emerald-600/25"
            disabled={busy || buying || Boolean(pausedReason)}
            onClick={() => onBuy(row)}
            title={
              pausedReason ??
              "The agent pays 0.01 USDC on Sui for this merchant's name, then writes it to Walrus Memory."
            }
          >
            {buying ? (
              stage === 1 ? (
                "Checking…"
              ) : stage === 3 ? (
                "Writing…"
              ) : (
                "Paying…"
              )
            ) : pausedReason ? (
              <>
                <Zap className="size-3.5" />
                <span className="hidden sm:inline">Reserve floor</span>
                <span className="sm:hidden">Low</span>
              </>
            ) : (
              <>
                <Zap className="size-3.5" />
                <span className="hidden sm:inline">Get label · </span>0.01 USDC
              </>
            )}
          </Button>
        )}

        {/*
          On a row that needs a label, the free option is always visible. It used
          to appear on hover only, which left the paid button as the single thing
          on screen — the hierarchy said "pay" to every reader who never hovered.
          Rows that already have a label keep the hover reveal, because there
          Correct is cleanup rather than a choice.
        */}
        <Button
          variant="outline"
          size="sm"
          disabled={busy || buying}
          onClick={() => onCorrect(row)}
          className={cn(
            "text-zinc-600 dark:text-zinc-300",
            !needsLabel && "reveal",
          )}
        >
          {busy ? "saving…" : "Correct"}
        </Button>
      </div>
    </div>
  );
}
