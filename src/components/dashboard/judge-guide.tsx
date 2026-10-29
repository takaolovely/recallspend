import { cn } from "@/lib/utils";

/**
 * JudgeGuide — the three things a judge is supposed to do, above the numbers.
 *
 * A demo that needs explaining loses the judge who reads for ninety seconds.
 * This is a slim strip, not a hero: three steps in the order they happen, and no
 * claim the page does not back up below.
 */
const STEPS: Array<{ n: string; title: string; body: string }> = [
  { n: "1", title: "Sync", body: "read your Sui history via Tatum" },
  { n: "2", title: "Teach", body: "“Get label · 0.01 USDC” lets the agent pay, or “Correct” it yourself" },
  { n: "3", title: "Verify", body: "watch Learned rules and Ask update" },
];

export function JudgeGuide({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mb-6 rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-2.5",
        "dark:border-emerald-500/25 dark:bg-emerald-950/40",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-900 dark:text-emerald-300">
          How it works
        </span>

        <ol className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-5">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex items-baseline gap-1.5 text-[11.5px] leading-snug text-emerald-950 dark:text-emerald-100"
            >
              <span className="grid size-4 shrink-0 translate-y-0.5 place-items-center rounded-full bg-emerald-900/15 text-[10px] font-semibold tabular-nums text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-200">
                {s.n}
              </span>
              <span>
                <span className="font-semibold">{s.title}</span>
                <span className="text-emerald-900/80 dark:text-emerald-200/80"> — {s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
