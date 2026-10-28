import { cn } from "@/lib/utils";

/**
 * Skeleton — shown while memory is being recalled.
 *
 * Without it the dashboard renders its empty state for the first two seconds of
 * every load, which reads as "you have no data" and then flips. A shaped
 * placeholder says "loading" without words.
 *
 * The pulse is opacity-only on purpose: it is the one animation on the page that
 * runs continuously, so it must stay cheap.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800/70", className)} />;
}

export function TransactionSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
      <Skeleton className="size-9 shrink-0 rounded-full sm:size-10" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-2.5 w-44" />
      </div>
      <Skeleton className="hidden h-5 w-24 rounded-full sm:block" />
      <Skeleton className="h-3.5 w-20" />
    </div>
  );
}

export function RuleSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200/70 p-4 pl-5 dark:border-zinc-800">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <Skeleton className="h-6 w-8" />
      </div>
      <Skeleton className="mt-3 h-1 w-full rounded-full" />
      <Skeleton className="mt-2 h-2 w-24" />
    </div>
  );
}
