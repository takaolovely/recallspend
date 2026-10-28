import { UserRound, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, shortAddress } from "@/lib/utils";
import { categoryMeta } from "./category-meta";
import type { RuleRow } from "@/lib/types";

/**
 * LearnedRuleItem — the product's differentiator, so it gets the accent border.
 *
 * The accent belongs to the paid rule, not to every rule. Two claims live in
 * this panel and they are not equally strong: "you taught me this" is a
 * correction, "I bought this" is a purchase with a settlement behind it. A
 * single emerald border on both made them look identical, which quietly
 * flattered the weaker claim. Corrected rules now carry a neutral border and a
 * badge in words; paid rules keep the emerald edge and show the price.
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
  /**
   * USDC the agent paid for this fact, when the rule came from a purchase
   * rather than a correction. Two different claims: "you taught me" and "I
   * bought this". Printing the wrong one would flatter the app.
   */
  paid,
}: {
  rule: RuleRow;
  covered: number;
  maxEvidence: number;
  paid?: number | null;
}) {
  const meta = categoryMeta(rule.category);
  const width = Math.max(12, Math.round((rule.evidence / Math.max(maxEvidence, 1)) * 100));
  const bought = Boolean(paid);

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-white p-4 pl-5",
        "before:absolute before:left-0 before:top-3.5 before:bottom-3.5 before:w-[3px] before:rounded-full",
        bought
          ? "border-emerald-200/80 before:bg-emerald-500 dark:border-emerald-500/25 dark:bg-emerald-500/[0.04]"
          : "border-zinc-200/80 before:bg-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:before:bg-zinc-700",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {rule.label ?? shortAddress(rule.target, 8, 6)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span className={cn("size-1.5 rounded-full", meta.dot)} />
              {rule.category}
            </span>
            <Badge
              variant={bought ? "emerald" : "default"}
              className="gap-1 px-1.5 py-0 text-[10px] font-semibold"
            >
              {bought ? <Zap className="size-2.5" /> : <UserRound className="size-2.5" />}
              {bought ? "Paid" : "Corrected"}
            </Badge>
          </div>
        </div>

        <div className="shrink-0 text-right">
          {bought ? (
            <>
              <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {paid} USDC
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                spent
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {rule.evidence}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                {rule.evidence === 1 ? "correction" : "corrections"}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            bought ? "bg-emerald-500/90" : "bg-zinc-400/80 dark:bg-zinc-600",
          )}
          style={{ width: `${width}%` }}
        />
      </div>

      <div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
        {covered > 0
          ? `applied to ${covered} other payment${covered === 1 ? "" : "s"}`
          : "no other payments yet"}
      </div>
    </div>
  );
}
