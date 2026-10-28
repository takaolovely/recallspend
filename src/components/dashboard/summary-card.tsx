import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * SummaryCard — one number, one label, one line of context.
 *
 * The number is the largest thing on the card on purpose: a finance dashboard
 * is read by scanning numbers, and everything else is annotation for them.
 *
 * Loading used to render an em dash, which is a real value in this layout: a
 * reader cannot tell "no data" from "not read yet". A shaped placeholder sits in
 * the number slot instead, so the card never states something it does not know.
 */
export function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  loading = false,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "neutral" | "emerald";
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-6",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        tone === "emerald"
          ? "before:bg-emerald-500"
          : "before:bg-zinc-200 dark:before:bg-zinc-700",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-lg",
            tone === "emerald"
              ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
              : "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700/60",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>

      <div className="mt-3.5">
        {loading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <div
            className={cn(
              "text-[2rem] font-bold leading-none tracking-tight tabular-nums",
              tone === "emerald"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-900 dark:text-zinc-50",
            )}
          >
            {value}
          </div>
        )}
      </div>

      {hint && (
        <div className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{hint}</div>
      )}
    </Card>
  );
}
