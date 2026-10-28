import { cn, shortAddress } from "@/lib/utils";
import { categoryMeta } from "./category-meta";
import type { RuleRow } from "@/lib/types";

/**
 * LearnedRuleItem — the product's differentiator, so it gets the only accent
 * border on the page.
 *
 * Evidence is written as "n corrections" plus a bar rather than a bare number,
 * because the claim being made is "this generalises", and generalisation is a
 * function of how many corrections agreed — not of confidence language.
 */
export function LearnedRuleItem({
  rule,
  /** Lines this rule currently covers, excluding the one that created it. */
  covered,
  maxEvidence,
}: {
  rule: RuleRow;
  covered: number;
  maxEvidence: number;
}) {
  const meta = categoryMeta(rule.category);
  const width = Math.max(12, Math.round((rule.evidence / Math.max(maxEvidence, 1)) * 100));

  return (
    <div
      className={cn(
        "relative rounded-xl border border-zinc-200/70 bg-white p-3.5 pl-4",
        "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full before:bg-emerald-500",
        "dark:border-zinc-800 dark:bg-zinc-900/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {rule.label ?? shortAddress(rule.target, 8, 6)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-500">
            <span className={cn("size-1.5 rounded-full", meta.dot)} />
            {rule.category}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {rule.evidence}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
            {rule.evidence === 1 ? "correction" : "corrections"}
          </div>
        </div>
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-500/80 transition-[width] duration-500"
          style={{ width: `${width}%` }}
        />
      </div>

      <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
        {covered > 0
          ? `applied to ${covered} other payment${covered === 1 ? "" : "s"}`
          : "no other payments yet"}
      </div>
    </div>
  );
}
