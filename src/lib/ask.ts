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
 *
 * One rule governs the wording: never claim the user taught something the agent
 * bought. A rule written by a paid lookup and a rule written by a correction look
 * identical in memory, and an early version of this file answered "your own
 * correction" for both. That is the same class of error as labelling a real
 * transfer with an invented merchant name — the app asserting something that did
 * not happen. Origin is read from the payment log, not guessed from the rule.
 */

export type Citation = { kind: "rule" | "spend" | "totals"; text: string };

export type Answer = { answer: string; citations: Citation[] };

/** "1 correction", never "1 corrections". */
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Addresses a person might type. `0x93f2` is six characters and must work, so the
 * floor is six rather than a full 64-character address. A truncated display form
 * such as `0x93f2…49de` yields its head, which is matched as a prefix.
 */
function addressTokens(text: string): string[] {
  return (text.match(/0x[0-9a-f]{4,64}/g) ?? []).filter((t) => t.length >= 6);
}

function matchesAddress(to: string, tokens: string[]): boolean {
  const a = to.toLowerCase();
  return tokens.some((t) => a.startsWith(t) || (t.length > 6 && a.endsWith(t.slice(2))));
}

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

  /**
   * Merchant addresses whose name was bought from the seller. The payment log is
   * the evidence; the rule itself carries no origin, so reading it from here is
   * the only honest way to say who taught the app something.
   */
  const paidTargets = new Map(
    ledger.pays
      .filter((p) => p.target && !p.voided)
      .map((p) => [p.target!.toLowerCase(), p] as const),
  );

  const originOf = (target: string): "paid" | "corrected" =>
    paidTargets.has(target.toLowerCase()) ? "paid" : "corrected";

  /* ---- "why was X put in Food" / "why is this Fees" ---- */
  const why = /\bwhy\b/.test(text);
  if (why) {
    const tokens = addressTokens(text);
    const merchantHit = ledger.spends.find((s) => {
      if (s.label && text.includes(s.label.toLowerCase())) return true;
      if (s.to && s.to !== "—" && matchesAddress(s.to, tokens)) return true;
      return false;
    });

    if (merchantHit) {
      const rule = ledger.rules.find((r) => r.target === merchantHit.to);
      const origin = rule ? originOf(rule.target) : "corrected";
      const pay = paidTargets.get(merchantHit.to.toLowerCase());
      const name = merchantHit.label ?? shortAddress(merchantHit.to);

      if (rule) {
        citations.push({
          kind: "rule",
          text: `rule|target=${shortAddress(rule.target)}|cat=${rule.category}|evidence=${rule.evidence}|origin=${origin}`,
        });
      }
      citations.push({
        kind: "spend",
        text: `${shortAddress(merchantHit.to)} · ${formatAmount(merchantHit.amount, merchantHit.symbol)} · ${merchantHit.category}`,
      });

      const confidence = Math.round(merchantHit.confidence * 100);

      const basis = merchantHit.corrected
        ? "You set this yourself, so it is a correction line in memory."
        : origin === "paid" && rule
          ? `The agent bought this merchant's name${pay ? ` for ${pay.amount} ${pay.symbol}` : ""} on Sui, so the rule comes from a paid label, not from you. Confidence reads ${confidence}%.`
          : merchantHit.by === "model"
            ? "An agent paid for the merchant label, so it comes from a paid lookup."
            : rule
              ? `A rule learned from your own corrections covers this merchant, with ${plural(rule.evidence, "correction")} behind it. Confidence reads ${confidence}%.`
              : merchantHit.category === "Uncategorized"
                ? "Nothing names this merchant yet, so there is no rule to argue about. Correct it yourself, or let the agent buy the name for 0.01 USDC."
                : "No rule covers it, so it fell back to the default category.";

      return {
        answer: `${name} is ${merchantHit.category}. ${basis}`,
        citations,
      };
    }

    const anyRule = ledger.rules[0];
    if (anyRule) {
      const origin = originOf(anyRule.target);
      citations.push({
        kind: "rule",
        text: `rule|target=${shortAddress(anyRule.target)}|cat=${anyRule.category}|evidence=${anyRule.evidence}|origin=${origin}`,
      });
      const backing =
        origin === "paid"
          ? "bought by the agent"
          : `backed by ${plural(anyRule.evidence, "correction")}`;
      return {
        answer: `I cannot tell which line you mean. The strongest rule I hold is ${anyRule.label ?? shortAddress(anyRule.target)} → ${anyRule.category}, ${backing}. Name the merchant or paste the first few characters of its address and I will explain that one.`,
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
      citations.push({
        kind: "rule",
        text: `rule|target=${shortAddress(r.target)}|cat=${r.category}|evidence=${r.evidence}|origin=${originOf(r.target)}`,
      });
    }

    const strongest = rules[0];
    const tail = strongest
      ? originOf(strongest.target) === "paid"
        ? ` Strongest: ${strongest.label ?? shortAddress(strongest.target)}, bought by the agent.`
        : ` Strongest: ${strongest.label ?? shortAddress(strongest.target)}, from ${plural(strongest.evidence, "correction")}.`
      : "";

    return {
      answer: `${row.category} is ${formatAmount(row.amount, month.symbol)} this month, ${Math.round(row.share * 100)}% of everything. ${plural(rules.length, "rule")} ${rules.length === 1 ? "points" : "point"} at that category.${tail}`,
      citations,
    };
  }

  /* ---- rules ---- */
  if (/\brule|learn|remember\b/.test(text)) {
    const top = ledger.rules.slice(0, 3);
    for (const r of top) {
      citations.push({
        kind: "rule",
        text: `rule|target=${shortAddress(r.target)}|cat=${r.category}|evidence=${r.evidence}|origin=${originOf(r.target)}`,
      });
    }

    if (!ledger.rules.length) {
      return {
        answer:
          "No rules yet. Correct a payment and the rule appears here — that is the whole learning loop.",
        citations,
      };
    }

    const best = top[0];
    const bestOrigin = originOf(best.target);
    const bestName = best.label ?? shortAddress(best.target);
    return {
      answer: `You have ${plural(ledger.rules.length, "learned rule")}. The strongest is ${bestName} → ${best.category}, ${bestOrigin === "paid" ? "bought by the agent" : `from ${plural(best.evidence, "correction")}`}.`,
      citations,
    };
  }

  /* ---- fallback: the summary ---- */
  const month = ledger.months[0];
  return {
    answer: month
      ? `${month.month}: ${formatAmount(month.total, month.symbol)} across ${plural(ledger.spends.length, "line")}. ${ledger.totals.uncategorized} still uncategorised, ${plural(ledger.rules.length, "rule")} learned. Ask me why a merchant sits in a category, or what a category totals.`
      : `I hold ${plural(ledger.spends.length, "line")} and ${plural(ledger.rules.length, "rule")}. Ask why a merchant sits where it does.`,
    citations,
  };
}
