import { Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryMeta } from "./category-meta";
import { cn, formatAmount, formatDate, formatTime, pct, shortAddress } from "@/lib/utils";
import type { SpendRow as Row } from "@/lib/types";

/**
 * TransactionRow.
 *
 * Three states matter visually and must not look alike:
 *   - nothing special: a category, quietly
 *   - learned:    the app applied a rule it was taught (emerald, small)
 *   - corrected:  you set this line yourself (emerald, "you")
 *
 * "Learned" is stated in words, not only in colour, because a colour-only signal
 * is invisible to a third of the people reading it.
 *
 * A fee is neither: nobody taught the app that gas is gas, it follows from the
 * transaction itself. Marking fees as "learned" made every row look trained and
 * quietly devalued the one badge that is supposed to mean something.
 */
export function TransactionRow({
  row,
  busy,
  onCorrect,
}: {
  row: Row;
  busy: boolean;
  onCorrect: (row: Row) => void;
}) {
  const meta = categoryMeta(row.category);
  const Icon = meta.icon;
  const isFee = row.to === "—";
  const learned = row.by === "rule" && row.confidence > 0 && !isFee && !row.corrected;
  const paid = row.by === "model";
  const valued = row.corrected || learned || paid;

  return (
    <div className="group flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 ease-[var(--ease-out)] hover:bg-zinc-50/80 sm:gap-4 sm:px-5 dark:hover:bg-zinc-800/30">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-zinc-200/70 bg-zinc-50 text-zinc-500 sm:size-10 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {row.label ?? (isFee ? "Network fee" : shortAddress(row.to))}
          </span>
          {row.corrected ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <UserRound className="size-3" />
              you
            </span>
          ) : learned ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Sparkles className="size-3" />
              learned
            </span>
          ) : paid ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Sparkles className="size-3" />
              paid lookup
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

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        <Badge variant={valued ? "emerald" : "default"} className="hidden sm:inline-flex">
          <span className={cn("size-1.5 rounded-full", meta.dot)} />
          {row.category}
        </Badge>

        <div className="w-24 text-right sm:w-28">
          <div className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatAmount(row.amount, row.symbol)}
          </div>
          <div className="text-[11px] text-zinc-400 dark:text-zinc-600">
            {row.corrected
              ? "you set this"
              : paid
                ? `${pct(row.confidence)} sure`
                : learned
                  ? `${pct(row.confidence)} sure`
                  : isFee
                    ? "no rule needed"
                    : "no rule"}
          </div>
        </div>

        <Button variant="outline" size="sm" disabled={busy} onClick={() => onCorrect(row)} className="reveal">
          {busy ? "saving…" : "Correct"}
        </Button>
      </div>
    </div>
  );
}
