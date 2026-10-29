/**
 * Categorisation, and the honest limits of it.
 *
 * A Sui transaction tells you an address sent a coin to another address. It
 * does not tell you that the recipient is a coffee shop. So there are exactly
 * three ways a line gets a category, and the UI always says which one:
 *
 *   by=rule  a rule learned from your own corrections (confidence from evidence)
 *   by=user  you set it directly
 *   by=model a paid enrichment lookup named the merchant (confidence is the
 *            endpoint's own, and it costs USDC per call)
 *
 * Anything else stays `Uncategorized`. Guessing silently would make the
 * accuracy number in the UI meaningless, and the accuracy number is the whole
 * proof that memory is doing work.
 */

import type { RuleLine } from "./memory";

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

export type Category = (typeof CATEGORIES)[number];

export function isCategory(x: string): x is Category {
  return (CATEGORIES as readonly string[]).includes(x);
}

export type Decision = {
  category: Category;
  by: "rule" | "user" | "model";
  confidence: number;
  label?: string;
  rule?: RuleLine;
};

/**
 * Confidence from evidence, not from vibes: one correction is a guess the app
 * is willing to act on, four are a habit. 1 - 0.5^n → .50 .75 .88 .94 .97
 */
export function confidenceFor(evidence: number): number {
  const n = Math.max(0, Math.min(evidence, 8));
  return 1 - Math.pow(0.5, n);
}

/** Rules for one wallet, strongest first. A rule with more evidence wins over
 *  an older one because it survived more of the user's decisions. */
export function rulesFor(wallet: string, all: RuleLine[]): RuleLine[] {
  return all
    .filter((r) => r.wallet === wallet)
    .sort((a, b) => b.evidence - a.evidence || (a.at < b.at ? 1 : -1));
}

export function decide(opts: {
  /** Counterparty address, lower-cased. */
  to: string;
  /** Amount in whole coins, used only for range rules. */
  amount: number;
  /** Existing label already paid for, if any. */
  label?: string;
  wallet: string;
  rules: RuleLine[];
  /** Category to fall back to when nothing matches. */
  fallback?: Category;
}): Decision {
  const to = opts.to.toLowerCase();

  // A line with no counterparty (a fee) can never be matched by a merchant
  // rule, and any rule that somehow targets "—" is ignored rather than allowed
  // to relabel every fee in the ledger.
  const usable = opts.rules.filter((r) => r.target && r.target !== "—" && r.target !== "*");

  // Exact merchant rule beats everything: it is the same address the user
  // corrected before.
  const exact = usable
    .filter((r) => r.wallet === opts.wallet)
    .sort((a, b) => b.evidence - a.evidence)
    .find((r) => r.target.toLowerCase() === to);
  if (exact) {
    return {
      category: isCategory(exact.category) ? exact.category : "Uncategorized",
      by: "rule",
      confidence: confidenceFor(exact.evidence),
      label: exact.label ?? opts.label,
      rule: exact,
    };
  }

  return {
    category: opts.fallback ?? "Uncategorized",
    by: "rule",
    confidence: 0,
    label: opts.label,
  };
}

/**
 * The learning number, defined so it cannot flatter the app.
 *
 * The tempting metric — "how many corrected lines does the app get right" — is
 * circular: the fix is the answer, so it always scores 100%. Useless.
 *
 * So the score is a hold-out: take the lines you did NOT correct, keep only the
 * ones whose merchant you HAVE labelled somewhere else, and ask whether the
 * learned rule predicts them. That measures generalisation, which is the only
 * claim worth making about memory.
 *
 *   before  rules that existed before your first correction
 *   after   rules now
 *
 * A merchant with no held-out lines contributes nothing, and an empty hold-out
 * is reported as zero rather than as a perfect score.
 */
export type LearningScore = {
  labelled: number;
  heldOut: number;
  correctBefore: number;
  correctAfter: number;
  before: number;
  after: number;
};

export function holdoutScore(
  rows: Array<{
    wallet: string;
    to: string;
    amount: number;
    category: string;
    corrected: boolean;
    /** True when this line's label was bought, so it is an origin, not a test. */
    paid?: boolean;
  }>,
  rulesBefore: RuleLine[],
  rulesAfter: RuleLine[],
): LearningScore {
  /**
   * Two ways a merchant becomes known: the user corrected it, or the agent paid
   * for its name. Both are labels; ignoring the paid ones made the panel
   * contradict itself — a rule card could say "applied to 1 other payment" while
   * the score read 0% because only corrections counted as ground truth.
   *
   * The origin line is never part of the hold-out. Scoring the line a rule was
   * derived from is the circular metric this whole function exists to avoid.
   */
  const labelledMerchants = new Map<string, string>();
  for (const r of rows) {
    if (r.paid && r.to && r.to !== "—" && r.category !== "Uncategorized") {
      labelledMerchants.set(r.to, r.category);
    }
  }
  // A correction outranks a purchase: it is the wallet owner's own statement.
  for (const r of rows) {
    if (r.corrected && r.to && r.to !== "—") labelledMerchants.set(r.to, r.category);
  }

  const heldOut = rows.filter(
    (r) =>
      !r.corrected &&
      !r.paid &&
      r.to &&
      r.to !== "—" &&
      labelledMerchants.has(r.to),
  );

  let correctBefore = 0;
  let correctAfter = 0;
  for (const r of heldOut) {
    const truth = labelledMerchants.get(r.to);
    const b = decide({ to: r.to, amount: r.amount, wallet: r.wallet, rules: rulesBefore });
    const a = decide({ to: r.to, amount: r.amount, wallet: r.wallet, rules: rulesAfter });
    if (b.category === truth) correctBefore += 1;
    if (a.category === truth) correctAfter += 1;
  }

  const pct = (n: number) => (heldOut.length === 0 ? 0 : n / heldOut.length);
  return {
    labelled: rows.filter((r) => r.corrected).length,
    heldOut: heldOut.length,
    correctBefore,
    correctAfter,
    before: pct(correctBefore),
    after: pct(correctAfter),
  };
}
