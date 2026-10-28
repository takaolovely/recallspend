import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-zinc-200 bg-zinc-100/70 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300",
        emerald:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
        outline:
          "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400",
        muted:
          "border-transparent bg-zinc-100 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-500",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
