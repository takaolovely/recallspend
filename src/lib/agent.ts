/**
 * The agent's job: one uncategorised spend in, one paid lookup out.
 *
 * Why an agent pays at all here. A Sui transaction gives an address and an
 * amount. To name the merchant you need knowledge the chain does not carry.
 * This app keeps that knowledge as memory lines: every time any wallet labels a
 * merchant, the address→label pair becomes visible to the others. Selling one
 * lookup for 0.01 USDC is the smallest honest version of that market — the
 * agent buys a fact it could not derive, and the payment settles on Sui.
 *
 * The registry is deliberately narrow: merchant address → label and category,
 * plus how many wallets agree. Amounts are never resold.
 *
 * Two rules keep this from being a money-burning machine:
 *   - the free preview runs first, so an unknown merchant is never charged for
 *   - a payment that returns no label writes no rule, so memory never gains a
 *     fact the app did not actually buy
 */

import {
  allLedgerLines,
  decodePay,
  decodeSpend,
  rememberPay,
  rememberRule,
  type SpendLine,
} from "./memory";
import { agentAddress, merchantAddress, payAndFetch, PRICE_USDC } from "./mpp";
import { proveUsdcTransfer } from "./verify";
import { SEED } from "./directory";
import { balances } from "./balance";

export type Profile = {
  address: string;
  label: string | null;
  category: string | null;
  /** Distinct wallets that labelled this address. Zero means seed data. */
  sources: number;
  confidence: number;
  /** Printed verbatim in the UI: "seed directory" or "3 corrections". */
  source: string;
};

/** Address → labels seen in memory across every wallet, plus the seed. */
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
      source: `${wallets.size} correction${wallets.size === 1 ? "" : "s"}`,
    });
  }

  // Seed entries fill gaps only. A real correction always outranks a seed, so
  // the moment a user labels a seeded merchant their answer wins.
  for (const s of SEED) {
    const key = s.address.toLowerCase();
    if (out.has(key)) continue;
    out.set(key, {
      address: key,
      label: s.label,
      category: s.category,
      sources: 0,
      confidence: 0.6,
      source: s.source,
    });
  }

  return out;
}

/**
 * Free preflight. Deliberately does not return the label — the answer is what
 * the payment buys. It returns only whether an answer exists, which is exactly
 * what stops the agent paying for nothing.
 */
export async function preview(address: string): Promise<{
  known: boolean;
  sources: number;
  source: string | null;
  price: string;
}> {
  const reg = await registry();
  const hit = reg.get(address.toLowerCase());
  return {
    known: Boolean(hit?.label),
    sources: hit?.sources ?? 0,
    source: hit?.source ?? null,
    price: PRICE_USDC,
  };
}

export type AgentWallet = {
  address: string;
  usdc: number;
  sui: number;
  /** How many 0.01 USDC lookups the balance still covers. */
  lookupsLeft: number;
};

/** The agent's account, so the payer is visible instead of implied. */
export async function agentWallet(opts: { fresh?: boolean } = {}): Promise<AgentWallet | null> {
  const address = agentAddress();
  if (!address) return null;
  const list = await balances(address, opts);
  const usdc = list.find((b) => b.symbol === "USDC")?.amount ?? 0;
  const sui = list.find((b) => b.symbol === "SUI")?.amount ?? 0;
  const price = Number(PRICE_USDC);
  return {
    address,
    usdc,
    sui,
    lookupsLeft: price > 0 ? Math.floor((usdc + 1e-9) / price) : 0,
  };
}

export type AgentStatus = "labelled" | "no_label" | "already" | "unfunded" | "error";

export type AgentResult = {
  spendId: string;
  status: AgentStatus;
  profile?: Profile;
  digest?: string;
  ruleBlob?: string;
  payBlob?: string;
  price?: string;
  error?: string;
};

/** The spend this request is about, or a reason it cannot be labelled. */
async function loadSpend(wallet: string, spendId: string) {
  const lines = await allLedgerLines(400);
  const spend = lines
    .map(decodeSpend)
    .filter((s): s is SpendLine => Boolean(s))
    .find((s) => s.wallet === wallet && s.id === spendId);
  const already = lines
    .map(decodePay)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .find((p) => p.wallet === wallet && spend && p.target.toLowerCase() === spend.to.toLowerCase());
  return { lines, spend, already };
}

/**
 * STEP 1 — settle.
 *
 * Pays the seller and returns the label and the Sui digest. Writes nothing.
 *
 * Split from the memory write on purpose. The relayer takes 20-40s per write and
 * a Vercel function is capped at 60s; doing both in one request meant the first
 * real payment settled on chain, both lines reached memory, and the caller was
 * still told "timeout". Now a slow write can only delay step 2, never lose a
 * payment that already happened.
 */
export async function payForLabel(opts: {
  wallet: string;
  spendId: string;
  origin: string;
}): Promise<AgentResult> {
  const w = opts.wallet.toLowerCase();
  const { spend, already } = await loadSpend(w, opts.spendId);

  if (!spend) return { spendId: opts.spendId, status: "error", error: "spend not found in memory" };

  // A fee has no counterparty. There is no merchant to name and nothing to buy.
  if (!spend.to || spend.to === "—") {
    return { spendId: opts.spendId, status: "no_label", error: "a network fee has no merchant to name" };
  }

  // Already bought once: never charge twice for the same address.
  if (already) return { spendId: opts.spendId, status: "already", digest: already.digest };

  // Preflight before money moves. This is the whole reason the free endpoint
  // exists; skipping it is how an agent pays 0.01 USDC for `label: null`.
  const pre = await preview(spend.to);
  if (!pre.known) {
    return {
      spendId: opts.spendId,
      status: "no_label",
      price: PRICE_USDC,
      error: "the seller has no label for this merchant, so nothing was charged",
    };
  }

  const purse = await agentWallet({ fresh: true });
  if (!purse) {
    return { spendId: opts.spendId, status: "unfunded", error: "no agent key configured" };
  }
  if (purse.usdc < Number(PRICE_USDC)) {
    return {
      spendId: opts.spendId,
      status: "unfunded",
      error: `agent wallet holds ${purse.usdc.toFixed(4)} USDC, needs ${PRICE_USDC}`,
    };
  }

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
    // Money already moved. Say so instead of retrying, and write nothing.
    return {
      spendId: opts.spendId,
      status: "no_label",
      profile,
      digest: paid.digest,
      error: "paid, but the seller returned no label",
    };
  }

  return {
    spendId: opts.spendId,
    status: "labelled",
    profile,
    digest: paid.digest,
    price: PRICE_USDC,
  };
}

/**
 * STEP 2 — remember.
 *
 * Verifies the digest on Sui, then writes the two lines. Idempotent: a merchant
 * already paid for is not written twice, so a retry after a timeout is safe.
 */
export async function recordLabel(opts: {
  wallet: string;
  spendId: string;
  digest: string;
}): Promise<AgentResult> {
  const w = opts.wallet.toLowerCase();
  const { spend, already } = await loadSpend(w, opts.spendId);

  if (!spend) return { spendId: opts.spendId, status: "error", error: "spend not found in memory" };
  if (already) return { spendId: opts.spendId, status: "already", digest: already.digest };

  const merchant = merchantAddress();
  if (!merchant) return { spendId: opts.spendId, status: "error", error: "MPP_RECIPIENT is not set" };

  // The label is whatever the seller just sold; the digest proves it was paid
  // for. Re-reading the registry is enough — it now has the answer cached.
  const reg = await registry();
  const profile = reg.get(spend.to.toLowerCase());
  if (!profile?.label) {
    return { spendId: opts.spendId, status: "no_label", error: "no label in the registry to record" };
  }

  const paid = await proveUsdcTransfer({
    digest: opts.digest,
    from: agentAddress() ?? "",
    to: merchant,
    minAmount: Number(PRICE_USDC),
  });
  if (!paid.ok) {
    return { spendId: opts.spendId, status: "error", error: `payment not proven: ${paid.reason}` };
  }

  const at = paid.at ?? new Date().toISOString();

  const [pay, rule] = await Promise.all([
    rememberPay({
      wallet: w,
      digest: opts.digest,
      amount: Number(PRICE_USDC),
      symbol: "USDC",
      to: merchant,
      for: `merchant:${profile.label}`,
      target: spend.to,
      at,
    }),
    rememberRule({
      wallet: w,
      target: spend.to,
      category: profile.category ?? "Uncategorized",
      label: profile.label,
      evidence: Math.max(1, profile.sources),
      at,
    }),
  ]);

  return {
    spendId: opts.spendId,
    status: "labelled",
    profile,
    digest: opts.digest,
    ruleBlob: rule.blobId,
    payBlob: pay.blobId,
    price: PRICE_USDC,
  };
}
