import { loadLedger } from "@/lib/ledger";
import { formatAmount, shortAddress } from "@/lib/utils";

/**
 * The agent chat, answered from memory and nothing else.
 *
 * There is no LLM here on purpose. Every answer is a lookup over the same lines
 * the ledger is built from, so the panel can always point at the memory that
 * produced the sentence. A generative answer would be more fluent and less
 * checkable, which is the wrong trade for a product whose claim is "your memory
 * is the source of truth".
 *
 * Intent matching is deliberately small: reason-about-one-line, category total,
 * rules, and a fallback summary.
 */

export type Citation = { kind: "rule" | "spend" | "totals"; text: string };

export type Answer = { answer: string; citations: Citation[] };

export async function ask(wallet: string, q: string): Promise<Answer> {
  const ledger = await loadLedger(wallet);
  const text = q.trim().toLowerCase();
  const citations: Citation[] = [];

  if (ledger.spends.length === 0) {
    return {
      answer:
        "This wallet has nothing in memory yet. Sync it once and I can explain any line after that — the ledger, not the chain, is what I read.",
      citations,
    };
  }

  /* ---- "why was X put in Food" / "why is this Fees" ---- */
  const why = /\bwhy\b/.test(text);
  if (why) {
    const merchantHit = ledger.spends.find((s) => {
      if (s.label && text.includes(s.label.toLowerCase())) return true;
      if (s.to && s.to !== "—" && text.includes(s.to.toLowerCase().slice(0, 10))) return true;
    });

    if (merchantHit) {
      const rule = ledger.rules.find((r) => r.target === merchantHit.to);
      if (rule) {
        citations.push({
          kind: "rule",
          text: `rule|target=${shortAddress(rule.target)}|cat=${rule.category}|evidence=${rule.evidence}`,
        });
      }
      citations.push({
        kind: "spend",
        text: `${shortAddress(merchantHit.to)} · ${formatAmount(merchantHit.amount, merchantHit.symbol)} · ${merchantHit.category}`,
      });

      const basis = merchantHit.corrected
        ? "You set this yourself, so it is a correction line in memory."
        : merchantHit.by === "model"
          ? "An agent paid for the merchant label, so it comes from a paid lookup."
          : rule
            ? `A rule from your own correction covers this merchant. Its evidence count is ${rule.evidence}, which is why confidence reads ${Math.round(merchantHit.confidence * 100)}%.`
            : "No rule covers it, so it fell back to the default category.";

      return {
        answer: `${merchantHit.label ?? shortAddress(merchantHit.to)} is ${merchantHit.category}. ${basis}`,
        citations,
      };
    }

    const anyRule = ledger.rules[0];
    if (anyRule) {
      citations.push({
        kind: "rule",
        text: `rule|target=${shortAddress(anyRule.target)}|cat=${anyRule.category}|evidence=${anyRule.evidence}`,
      });
      return {
        answer: `I cannot tell which line you mean. The strongest rule I hold is ${anyRule.label ?? shortAddress(anyRule.target)} → ${anyRule.category}, backed by ${anyRule.evidence} correction${anyRule.evidence === 1 ? "" : "s"}. Name the merchant and I will explain that one.`,
        citations,
      };
    }
  }

  /* ---- category totals ---- */
  const cat = ["food", "transport", "groceries", "subscriptions", "shopping", "bills", "fees", "transfers"]
    .find((c) => text.includes(c));
  if (cat) {
    const month = ledger.months[0];
    const row = month?.byCategory.find((c) => c.category.toLowerCase() === cat);
    const rules = ledger.rules.filter((r) => r.category.toLowerCase() === cat);

    if (!row) {
      return {
        answer: `Nothing categorised as ${cat} in ${month?.month ?? "this period"}. If a merchant should be there, correct one payment and the rule will cover the rest.`,
        citations,
      };
    }

    for (const r of rules.slice(0, 4)) {
      citations.push({ kind: "rule", text: `rule|target=${shortAddress(r.target)}|cat=${r.category}|evidence=${r.evidence}` });
    }

    return {
      answer: `${row.category} is ${formatAmount(row.amount, month.symbol)} this month, ${Math.round(row.share * 100)}% of everything. ${rules.length} rule${rules.length === 1 ? "" : "s"} point${rules.length === 1 ? "s" : ""} at that category${rules.length ? `, the strongest backed by ${Math.max(...rules.map((r) => r.evidence))} corrections` : ""}.`,
      citations,
    };
  }

  /* ---- rules ---- */
  if (/\brule|learn|remember\b/.test(text)) {
    const top = ledger.rules.slice(0, 3);
    for (const r of top) {
      citations.push({ kind: "rule", text: `rule|target=${shortAddress(r.target)}|cat=${r.category}|evidence=${r.evidence}` });
    }
    return {
      answer: ledger.rules.length
        ? `You have ${ledger.rules.length} learned rule${ledger.rules.length === 1 ? "" : "s"}. The strongest is ${top[0].label ?? shortAddress(top[0].target)} → ${top[0].category} with ${top[0].evidence} corrections behind it.`
        : "No rules yet. Correct a payment and the rule appears here — that is the whole learning loop.",
      citations,
    };
  }

  /* ---- fallback: the summary ---- */
  const month = ledger.months[0];
  return {
    answer: month
      ? `${month.month}: ${formatAmount(month.total, month.symbol)} across ${ledger.spends.length} lines. ${ledger.totals.uncategorized} still uncategorised, ${ledger.rules.length} rules learned. Ask me why a merchant sits in a category, or what a category totals.`
      : `I hold ${ledger.spends.length} lines and ${ledger.rules.length} rules. Ask why a merchant sits where it does.`,
    citations,
  };
}
