/**
 * The agent's job: one uncategorised spend in, one paid lookup out.
 *
 * Why an agent pays at all here. A Sui transaction gives an address and an
 * amount. To name the merchant you need knowledge the chain does not carry.
 * This app keeps that knowledge as memory lines: every time any user labels a
 * merchant, the address→label pair becomes visible to the others. Selling one
 * lookup for 0.01 USDC is the smallest honest version of that market — the
 * agent buys a fact it could not derive, and the payment settles on Sui.
 *
 * The registry is deliberately narrow: merchant address → label and category,
 * plus how many wallets agree. Amounts are never resold.
 */

import { allLedgerLines, decodeSpend, rememberPay, rememberRule, type SpendLine } from "./memory";
import { merchantAddress, payAndFetch, PRICE_USDC } from "./mpp";

export type Profile = {
  address: string;
  label: string | null;
  category: string | null;
  /** Distinct wallets that labelled this address. Zero means "we know nothing". */
  sources: number;
  confidence: number;
};

/** Address → labels seen in memory across every wallet. */
export async function registry(): Promise<Map<string, Profile>> {
  const lines = await allLedgerLines(400);
  const spendLines = lines.map(decodeSpend).filter((s): s is SpendLine => Boolean(s));

  const byAddress = new Map<string, { labels: Map<string, Set<string>>; categories: Map<string, number> }>();
  for (const s of spendLines) {
    if (!s.label || s.to === "—") continue;
    const key = s.to.toLowerCase();
    const entry = byAddress.get(key) ?? { labels: new Map(), categories: new Map() };
    if (!entry.labels.has(s.label)) entry.labels.set(s.label, new Set());
    entry.labels.get(s.label)!.add(s.wallet);
    entry.categories.set(s.category, (entry.categories.get(s.category) ?? 0) + 1);
    byAddress.set(key, entry);
  }

  const out = new Map<string, Profile>();
  for (const [address, entry] of byAddress) {
    // Most-agreed label wins; ties break on the larger label string only so the
    // result is stable between reads.
    const [label, wallets] =
      [...entry.labels.entries()].sort(
        (a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1),
      )[0] ?? [null, new Set<string>()];

    const category =
      [...entry.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    out.set(address, {
      address,
      label,
      category,
      sources: wallets.size,
      confidence: Math.min(0.95, 0.4 + 0.15 * wallets.size),
    });
  }
  return out;
}

export async function preview(address: string): Promise<{ known: boolean; sources: number; price: string }> {
  const reg = await registry();
  const hit = reg.get(address.toLowerCase());
  return { known: Boolean(hit?.label), sources: hit?.sources ?? 0, price: PRICE_USDC };
}

export type AgentResult = {
  spendId: string;
  status: "labelled" | "unknown" | "unfunded" | "error";
  profile?: Profile;
  digest?: string;
  ruleBlob?: string;
  payBlob?: string;
  error?: string;
};

/**
 * Buy the label for one spend, then write two things:
 *   pay line  — the agent's own 0.01 USDC spend, with its Sui digest
 *   rule line — the label as a rule, so this merchant is never asked again
 *
 * A failed payment never produces a rule. Memory must not contain a fact the
 * app did not actually buy.
 */
export async function enrichSpend(opts: {
  wallet: string;
  spendId: string;
  origin: string;
}): Promise<AgentResult> {
  const lines = await allLedgerLines(400);
  const spend = lines
    .map(decodeSpend)
    .filter((s): s is SpendLine => Boolean(s))
    .find((s) => s.wallet === opts.wallet.toLowerCase() && s.id === opts.spendId);

  if (!spend) return { spendId: opts.spendId, status: "error", error: "spend not found in memory" };

  const paid = await payAndFetch(`${opts.origin}/api/enrich`, { address: spend.to });

  if (!paid.ok) {
    return {
      spendId: opts.spendId,
      status: paid.unfunded ? "unfunded" : "error",
      error: paid.error,
    };
  }

  const profile = (paid.body as { profile?: Profile } | undefined)?.profile;
  if (!profile?.label) {
    return { spendId: opts.spendId, status: "unknown", profile, error: "no label in the registry yet" };
  }

  const at = new Date().toISOString();

  const pay = await rememberPay({
    wallet: opts.wallet.toLowerCase(),
    digest: paid.digest ?? "",
    amount: Number(PRICE_USDC),
    symbol: "USDC",
    to: merchantAddress() ?? "",
    for: `label:${spend.to.slice(0, 12)}`,
    at,
  });

  const rule = await rememberRule({
    wallet: opts.wallet.toLowerCase(),
    target: spend.to,
    category: profile.category ?? "Uncategorized",
    label: profile.label,
    evidence: Math.max(1, profile.sources),
    at,
  });

  return {
    spendId: opts.spendId,
    status: "labelled",
    profile,
    digest: paid.digest,
    ruleBlob: rule.blobId,
    payBlob: pay.blobId,
  };
}
