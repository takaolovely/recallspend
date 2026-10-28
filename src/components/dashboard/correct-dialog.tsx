"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { categoryMeta } from "./category-meta";
import { CATEGORIES, type SpendRow } from "@/lib/types";
import { cn, formatAmount, shortAddress } from "@/lib/utils";

/**
 * Correct — the one interaction that creates memory.
 *
 * A grid of categories instead of a select: one tap is the whole point, and a
 * dropdown on a phone costs two touches and a scroll. The merchant label is
 * optional and sits below, because most people will never fill it in and the
 * category is what the rule is built from.
 */
export function CorrectDialog({
  row,
  open,
  busy,
  onOpenChange,
  onSave,
}: {
  row: SpendRow | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (category: string, label?: string) => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [label, setLabel] = useState("");

  // Reset when the dialog opens on a new row. Done in the open handler rather
  // than an effect so the first paint already shows the current category.
  const active = category || row?.category || "Food";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setCategory(row?.category === "Uncategorized" ? "Food" : (row?.category ?? "Food"));
          setLabel(row?.label ?? "");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct this payment</DialogTitle>
          <DialogDescription>
            {row ? (
              <>
                {row.label ?? (row.to === "—" ? "Network fee" : shortAddress(row.to, 10, 6))} ·{" "}
                <span className="tabular-nums">{formatAmount(row.amount, row.symbol)}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const meta = categoryMeta(c);
            const Icon = meta.icon;
            const selected = active === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] font-medium transition-colors",
                  selected
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/50",
                )}
              >
                <Icon className="size-4" />
                {c}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Merchant name <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Kopi Kenangan"
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
          Writes two lines to Walrus Memory: this correction, and a rule for the merchant. Nothing
          is overwritten — the original guess stays readable.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="emerald"
            onClick={() => onSave(active, label.trim() || undefined)}
            disabled={busy}
          >
            <Check className="size-4" />
            {busy ? "Writing memory…" : "Remember"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
