import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * EmptyState — the first screen most judges will see if a wallet has no history.
 *
 * Deliberately designed rather than a bare line of text: an empty dashboard is
 * still a product decision, and "nothing here" with no next step reads as broken.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed bg-zinc-50/40 p-10 text-center dark:bg-zinc-900/20">
      <div className="mx-auto grid size-12 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </Card>
  );
}
