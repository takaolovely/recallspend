/**
 * Walrus Memory — the only store in this app.
 *
 * There is no database. Spending history, the rules learned from corrections,
 * and budget settings all live here as plain text lines. Two consequences that
 * matter for the hackathon criteria:
 *
 *   1. memory is the source of truth, not a cache in front of one — delete the
 *      app and the ledger is still there, addressed by the wallet it belongs to
 *   2. every learned rule is a line you can read, quote and audit, with the
 *      evidence that produced it
 *
 * Recall is a similarity search with no cursor, so the query text is a bait
 * word that every line of that family contains, and the limit is generous
 * because callers decode-and-filter afterwards.
 */

import { MemWal } from "@mysten-incubation/memwal";

export const LEDGER_NS = "recallspend-ledger";
export const RULES_NS = "recallspend-rules";

let ledgerClient: MemWal | null = null;
let rulesClient: MemWal | null = null;

function make(namespace: string): MemWal {
  const key = process.env.WALRUS_DELEGATE_KEY;
  const accountId = process.env.WALRUS_ACCOUNT_ID;
  if (!key || !accountId) {
    throw new Error("Walrus Memory credentials are not set (WALRUS_DELEGATE_KEY / WALRUS_ACCOUNT_ID)");
  }
  return MemWal.create({
    key,
    accountId,
    serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
    namespace,
  });
}

export function ledger(): MemWal {
  if (!ledgerClient) ledgerClient = make(LEDGER_NS);
  return ledgerClient;
}

export function rules(): MemWal {
  if (!rulesClient) rulesClient = make(RULES_NS);
  return rulesClient;
}

export const clean = (s: string, max = 90) =>
  String(s ?? "").replace(/[|\n\r]/g, " ").trim().slice(0, max);

export function fields(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(line || "").trim().split("|").slice(1)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Line codecs                                                        */
/* ------------------------------------------------------------------ */

export type SpendLine = {
  /** Wallet this line belongs to. Memory is per account, so wallets must be
   *  separated by a field instead of by namespace. */
  wallet: string;
  /** Stable id: digest + index of the outflow inside that digest. */
  id: string;
  digest: string;
  at: string;
  amount: number;
  symbol: string;
  decimals: number;
  to: string;
  category: string;
  /** Who decided the category: "rule", "user", or "model". */
  by: "rule" | "user" | "model";
  confidence: number;
  label?: string;
  /** Set when the merchant label was bought from the paid enrichment endpoint. */
  paid?: string;
};

export function encodeSpend(s: SpendLine): string {
  const parts = [
    "spend",
    `wallet=${s.wallet}`,
    `id=${clean(s.id)}`,
    `dig=${clean(s.digest)}`,
    `at=${s.at}`,
    `amt=${s.amount}`,
    `sym=${s.symbol}`,
    `dec=${s.decimals}`,
    `to=${clean(s.to)}`,
    `cat=${clean(s.category, 40)}`,
    `by=${s.by}`,
    `conf=${s.confidence.toFixed(2)}`,
  ];
  if (s.label) parts.push(`label=${clean(s.label, 60)}`);
  if (s.paid) parts.push(`paid=${clean(s.paid, 70)}`);
  return parts.join("|");
}

export function decodeSpend(line: string): SpendLine | null {
  if (!String(line).trim().startsWith("spend|")) return null;
  const f = fields(line);
  const amount = Number(f.amt);
  if (!f.wallet || !f.id || !Number.isFinite(amount)) return null;
  return {
    wallet: f.wallet,
    id: f.id,
    digest: f.dig || "",
    at: f.at || "",
    amount,
    symbol: f.sym || "SUI",
    decimals: Number(f.dec) || 9,
    to: f.to || "",
    category: f.cat || "Uncategorized",
    by: f.by === "user" ? "user" : f.by === "model" ? "model" : "rule",
    confidence: Number(f.conf) || 0,
    label: f.label,
    paid: f.paid,
  };
}

export type RuleLine = {
  wallet: string;
  /** Merchant address or, for a whole category, "*". */
  target: string;
  category: string;
  label?: string;
  /** How many corrections produced this rule. */
  evidence: number;
  at: string;
};

export function encodeRule(r: RuleLine): string {
  const parts = [
    "rule",
    `wallet=${r.wallet}`,
    `target=${clean(r.target)}`,
    `cat=${clean(r.category, 40)}`,
    `evidence=${r.evidence}`,
    `at=${r.at}`,
  ];
  if (r.label) parts.push(`label=${clean(r.label, 60)}`);
  return parts.join("|");
}

export function decodeRule(line: string): RuleLine | null {
  if (!String(line).trim().startsWith("rule|")) return null;
  const f = fields(line);
  if (!f.wallet || !f.cat) return null;
  return {
    wallet: f.wallet,
    target: f.target || "*",
    category: f.cat,
    label: f.label,
    evidence: Number(f.evidence) || 1,
    at: f.at || "",
  };
}

export type BudgetLine = {
  wallet: string;
  category: string;
  monthly: number;
  symbol: string;
  at: string;
};

export function encodeBudget(b: BudgetLine): string {
  return [
    "budget",
    `wallet=${b.wallet}`,
    `cat=${clean(b.category, 40)}`,
    `monthly=${b.monthly}`,
    `sym=${b.symbol}`,
    `at=${b.at}`,
  ].join("|");
}

export function decodeBudget(line: string): BudgetLine | null {
  if (!String(line).trim().startsWith("budget|")) return null;
  const f = fields(line);
  const monthly = Number(f.monthly);
  if (!f.wallet || !f.cat || !Number.isFinite(monthly)) return null;
  return {
    wallet: f.wallet,
    category: f.cat,
    monthly,
    symbol: f.sym || "USDC",
    at: f.at || "",
  };
}

/**
 * A correction is a new line, never an edit.
 *
 * Walrus Memory treats the same idempotency key with different text as a 409
 * conflict, and that is a feature here: the spend line stays exactly as it was
 * observed, and every correction you make is appended next to it. The ledger
 * you read is spend lines plus the latest fix per line, which means the app can
 * always show what it thought *before* you corrected it — the raw material for
 * a before/after accuracy number that is not a marketing claim.
 */
export type FixLine = {
  wallet: string;
  /** Spend line id being corrected. */
  id: string;
  category: string;
  label?: string;
  at: string;
};

export function encodeFix(f: FixLine): string {
  const parts = [
    "fix",
    `wallet=${f.wallet}`,
    `id=${clean(f.id)}`,
    `cat=${clean(f.category, 40)}`,
    `at=${f.at}`,
  ];
  if (f.label) parts.push(`label=${clean(f.label, 60)}`);
  return parts.join("|");
}

export function decodeFix(line: string): FixLine | null {
  if (!String(line).trim().startsWith("fix|")) return null;
  const f = fields(line);
  if (!f.wallet || !f.id || !f.cat) return null;
  return { wallet: f.wallet, id: f.id, category: f.cat, label: f.label, at: f.at || "" };
}

/** A paid enrichment call recorded as its own line: the agent's spend is
 *  visible in the same ledger the human's spend is. */
export type PayLine = {
  wallet: string;
  digest: string;
  amount: number;
  symbol: string;
  to: string;
  for: string;
  at: string;
};

export function encodePay(p: PayLine): string {
  return [
    "pay",
    `wallet=${p.wallet}`,
    `dig=${clean(p.digest)}`,
    `amt=${p.amount}`,
    `sym=${p.symbol}`,
    `to=${clean(p.to)}`,
    `for=${clean(p.for, 60)}`,
    `at=${p.at}`,
  ].join("|");
}

export function decodePay(line: string): PayLine | null {
  if (!String(line).trim().startsWith("pay|")) return null;
  const f = fields(line);
  if (!f.dig && !f.for) return null;
  return {
    wallet: f.wallet || "",
    digest: f.dig || "",
    amount: Number(f.amt) || 0,
    symbol: f.sym || "USDC",
    to: f.to || "",
    for: f.for || "",
    at: f.at || "",
  };
}

/* ------------------------------------------------------------------ */
/* Read cache                                                         */
/* ------------------------------------------------------------------ */

/**
 * The relayer rate-limits an account at 1000 weighted requests an hour, and a
 * single page render can trigger several reads. A short per-process cache keeps
 * a reload free without pretending the data is fresher than it is.
 */
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; lines: string[] }>();

export function invalidate(namespace?: string) {
  if (namespace) cache.delete(namespace);
  else cache.clear();
}

async function recallLines(
  client: MemWal,
  namespace: string,
  query: string,
  limit: number,
): Promise<string[]> {
  const hit = cache.get(namespace);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.lines;

  const res = await client.recall(query, limit, namespace);
  const lines: string[] = [];
  for (const r of res.results ?? []) {
    if (typeof r.text === "string" && r.text.trim()) lines.push(r.text.trim());
  }
  cache.set(namespace, { at: Date.now(), lines });
  return lines;
}

export async function allLedgerLines(limit = 400): Promise<string[]> {
  return recallLines(
    ledger(),
    LEDGER_NS,
    "spend wallet amount to category fix pay digest correction",
    limit,
  );
}

export async function allRuleLines(limit = 200): Promise<string[]> {
  return recallLines(rules(), RULES_NS, "rule wallet target category evidence budget", limit);
}

export type WriteResult = { blobId: string };

/** Writes are awaited: "stored" must mean durable before it is counted. */
export async function rememberSpend(s: SpendLine): Promise<WriteResult> {
  const res = await ledger().rememberAndWait(encodeSpend(s), LEDGER_NS, {
    // Same spend re-ingested twice must not become two lines.
    idempotencyKey: `spend:${s.wallet}:${s.id}`,
  });
  invalidate(LEDGER_NS);
  return { blobId: res.blob_id };
}

export async function rememberFix(f: FixLine): Promise<WriteResult> {
  const res = await ledger().rememberAndWait(encodeFix(f), LEDGER_NS, {
    // One correction per spend line per moment; re-clicking the same choice is
    // a no-op instead of a second identical memory.
    idempotencyKey: `fix:${f.wallet}:${f.id}:${f.category}`,
  });
  invalidate(LEDGER_NS);
  return { blobId: res.blob_id };
}

/**
 * Bulk write. One relayer round-trip for N lines instead of N.
 *
 * This is not an optimisation, it is a deadline fix: a single rememberAndWait
 * costs ~20-30s, so seven sequential writes blew past a serverless function's
 * 60s budget and a sync that had actually succeeded looked like a timeout.
 *
 * Trade-off, stated honestly: bulk items carry no idempotency key, so this path
 * relies on the caller deduplicating against existing memory before writing.
 * `rememberSpend` (single, keyed) stays for the cases that need the guarantee.
 */
export async function rememberSpends(
  items: SpendLine[],
): Promise<{ written: number; failed: number; blobIds: string[] }> {
  if (items.length === 0) return { written: 0, failed: 0, blobIds: [] };

  const res = await ledger().rememberBulkAndWait(
    items.map((s) => ({ text: encodeSpend(s), namespace: LEDGER_NS })),
  );

  const results = res.results ?? [];
  invalidate(LEDGER_NS);
  return {
    written: results.filter((r) => r.status === "done").length,
    failed: results.filter((r) => r.status !== "done").length,
    blobIds: results.map((r) => r.blob_id).filter(Boolean),
  };
}

export async function rememberRule(r: RuleLine): Promise<WriteResult> {
  const res = await rules().rememberAndWait(encodeRule(r), RULES_NS, {
    idempotencyKey: `rule:${r.wallet}:${r.target}:${r.category}`,
  });
  invalidate(RULES_NS);
  return { blobId: res.blob_id };
}

export async function rememberBudget(b: BudgetLine): Promise<WriteResult> {
  const res = await rules().rememberAndWait(encodeBudget(b), RULES_NS, {
    idempotencyKey: `budget:${b.wallet}:${b.category}`,
  });
  invalidate(RULES_NS);
  return { blobId: res.blob_id };
}

export async function rememberPay(p: PayLine): Promise<WriteResult> {
  const res = await ledger().rememberAndWait(encodePay(p), LEDGER_NS, {
    idempotencyKey: `pay:${p.digest}`,
  });
  invalidate(LEDGER_NS);
  return { blobId: res.blob_id };
}

/** Total memories visible to this account, both families. Used for the ≥10 gate. */
export async function memoryCount(): Promise<number> {
  const [a, b] = await Promise.all([allLedgerLines(400), allRuleLines(200)]);
  return a.length + b.length;
}
