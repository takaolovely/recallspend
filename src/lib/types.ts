export type SpendRow = {
  id: string;
  digest: string;
  at: string;
  amount: number;
  symbol: string;
  to: string;
  category: string;
  original: string | null;
  by: "rule" | "user" | "model";
  confidence: number;
  label?: string;
  paid?: string;
  corrected: boolean;
};

export type RuleRow = {
  target: string;
  category: string;
  label?: string;
  evidence: number;
  at: string;
};

export type PayRow = {
  digest: string;
  amount: number;
  symbol: string;
  to: string;
  for: string;
  /** Merchant address the label belongs to, so a payment can be joined to rows. */
  target?: string;
  at: string;
};

/** The agent's own account, read from Sui rather than assumed. */
export type AgentInfo = {
  address: string;
  usdc: number;
  sui: number;
  lookupsLeft: number;
  price?: string;
};

export type Ledger = {
  wallet: string;
  spends: SpendRow[];
  pays: PayRow[];
  rules: RuleRow[];
  budgets: Array<{ category: string; monthly: number; symbol: string }>;
  totals: {
    rows: number;
    corrected: number;
    uncategorized: number;
    learnedRules: number;
    memories: number;
  };
  months: Array<{
    month: string;
    total: number;
    symbol: string;
    byCategory: Array<{ category: string; amount: number; share: number }>;
  }>;
  learning: {
    labelled: number;
    heldOut: number;
    before: number;
    after: number;
    correctBefore: number;
    correctAfter: number;
  };
};

export type Balance = { symbol: string; amount: number; decimals: number };

export type TatumState = { credits: number; calls: number; cap: number; remaining: number };

export const CATEGORIES = [
  "Food",
  "Transport",
  "Groceries",
  "Subscriptions",
  "Shopping",
  "Bills",
  "Fees",
  "Transfers",
  "Uncategorized",
] as const;
