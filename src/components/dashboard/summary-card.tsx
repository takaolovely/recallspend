import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * SummaryCard — one number, one label, one line of context.
 *
 * The number is the largest thing on the card on purpose: a finance dashboard
 * is read by scanning numbers, and everything else is annotation for them.
 */
export function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "neutral" | "emerald";
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg",
            tone === "emerald"
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>

      <div
        className={cn(
          "mt-3 text-3xl font-semibold tracking-tight tabular-nums",
          tone === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-zinc-900 dark:text-zinc-50",
        )}
      >
        {value}
      </div>

      {hint && (
        <div className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">{hint}</div>
      )}
    </Card>
  );
}
