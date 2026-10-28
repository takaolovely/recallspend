import {
  ArrowLeftRight,
  Car,
  HelpCircle,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingBasket,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Category presentation.
 *
 * Colour is a dot, not a filled badge: nine saturated pills in a feed read as a
 * toy, and the emerald accent has to stay meaningful — it means "the app
 * learned this", not "this is a category".
 */
export type CategoryMeta = {
  icon: LucideIcon;
  dot: string;
  text: string;
};

export const CATEGORY_META: Record<string, CategoryMeta> = {
  Food: { icon: Utensils, dot: "bg-amber-400", text: "text-amber-700 dark:text-amber-300" },
  Transport: { icon: Car, dot: "bg-sky-400", text: "text-sky-700 dark:text-sky-300" },
  Groceries: {
    icon: ShoppingBasket,
    dot: "bg-lime-400",
    text: "text-lime-700 dark:text-lime-300",
  },
  Subscriptions: {
    icon: Repeat,
    dot: "bg-violet-400",
    text: "text-violet-700 dark:text-violet-300",
  },
  Shopping: {
    icon: ShoppingBag,
    dot: "bg-pink-400",
    text: "text-pink-700 dark:text-pink-300",
  },
  Bills: { icon: Receipt, dot: "bg-orange-400", text: "text-orange-700 dark:text-orange-300" },
  Fees: { icon: Zap, dot: "bg-zinc-400", text: "text-zinc-600 dark:text-zinc-400" },
  Transfers: {
    icon: ArrowLeftRight,
    dot: "bg-teal-400",
    text: "text-teal-700 dark:text-teal-300",
  },
  Uncategorized: {
    icon: HelpCircle,
    dot: "bg-zinc-300 dark:bg-zinc-600",
    text: "text-zinc-500 dark:text-zinc-500",
  },
};

export function categoryMeta(name: string): CategoryMeta {
  return CATEGORY_META[name] ?? CATEGORY_META.Uncategorized;
}
