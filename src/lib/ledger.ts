/**
 * Ingest + read model.
 *
 * Ingest is the only place that spends Tatum credits, and it runs at most once
 * per wallet per sync window. Everything it learns is written to Walrus Memory
 * as immutable lines, so a page load afterwards costs zero credits — that is
 * how a 100k-credit allowance survives a demo week instead of an afternoon.
 *
 * The read model is computed, never stored: spend lines + latest fix per line +
 * rules + budgets, folded into totals. Same principle as SignalScore's board —
 * a number that summarises memory is recomputed from that memory every time, so
 * it can never drift from the record it claims to describe.
 */

import {
  allLedgerLines,
  allRuleLines,
  decodeBudget,
  decodeFix,
  decodePay,
  decodeRule,
  decodeSpend,
  rememberFix,
  rememberRule,
  rememberSpend,
  rememberSpends,
  type BudgetLine,
  type FixLine,
  type PayLine,
  type RuleLine,
  type SpendLine,
} from "./memory";
import { coinInfo, historyPage, type RawTx } from "./tatum";
import { decide, holdoutScore, rulesFor, type Category } from "./classify";

export type SpendRow = {
  id: string;
  digest: string;
  at: string;
  amount: number;
  symbol: string;
  to: string;
  category: Category | string;
  /** Category the classifier produced before your correction, if one exists. */
  original: string | null;
  by: "rule" | "user" | "model";
  confidence: number;
  label?: string;
  paid?: string;
  corrected: boolean;
};

export type Ledger = {
  wallet: string;
  spends: SpendRow[];
  pays: PayLine[];
  rules: RuleLine[];
  budgets: BudgetLine[];
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
    before: number;
    after: number;
    correctBefore: number;
    correctAfter: number;
  };
};

/* ------------------------------------------------------------------ */
/* Extraction                                                         */
/* ------------------------------------------------------------------ */

const MIN_TRANSFER = 1e-6;

/**
 * Turn raw transactions into outflow lines.
 *
 * Two shapes matter:
 *   - a transfer: this wallet loses coin X, another address gains it. The
 *     positive side is the real amount; the negative side includes gas, which
 *     would otherwise inflate every purchase by a fee that belongs to Fees.
 *   - a fee or burn: this wallet loses coin X and nobody gains it. That is gas,
 *     not spending, and it is labelled as such instead of being hidden.
 */
export function extractSpends(wallet: string, txs: RawTx[]): SpendLine[] {
  const me = wallet.toLowerCase();
  const out: SpendLine[] = [];

  for (const tx of txs) {
    const changes = tx.effects?.balanceChanges?.nodes ?? [];
    const at = tx.effects?.timestamp ?? "";
    if (!at || tx.effects?.status !== "SUCCESS") continue;

    // coinType -> per-owner net change
    const byCoin = new Map<string, Map<string, number>>();
    for (const c of changes) {
      const addr = c.owner?.address?.toLowerCase();
      const repr = c.coinType?.repr;
      if (!addr || !repr) continue;
      const raw = Number(c.amount);
      if (!Number.isFinite(raw)) continue;
      if (!byCoin.has(repr)) byCoin.set(repr, new Map());
      const m = byCoin.get(repr)!;
      m.set(addr, (m.get(addr) ?? 0) + raw);
    }

    let idx = 0;
    for (const [repr, owners] of byCoin) {
      const mineRaw = owners.get(me);
      if (!mineRaw || mineRaw >= 0) continue;

      const { symbol, decimals } = coinInfo(repr);
      const unit = Math.pow(10, decimals);
      const mine = Math.abs(mineRaw) / unit;

      // Who else gained? Largest gain is the counterparty.
      let counterparty: string | null = null;
      let theirs = 0;
      for (const [addr, raw] of owners) {
        if (addr === me || raw <= 0) continue;
        if (raw / unit > theirs) {
          theirs = raw / unit;
          counterparty = addr;
        }
      }

      const isFee = counterparty === null;
      const amount = isFee ? mine : Math.min(mine, theirs);
      if (amount < MIN_TRANSFER) continue;

      out.push({
        wallet: me,
        id: `${tx.digest}:${idx++}`,
        digest: tx.digest,
        at,
        amount: round(amount, decimals > 6 ? 9 : 6),
        symbol,
        decimals,
        to: counterparty ?? "—",
        category: isFee ? "Fees" : "Uncategorized",
        by: "rule",
        confidence: isFee ? 1 : 0,
      });
    }
  }

  return out;
}

const round = (x: number, dp: number) => {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
};

/* ------------------------------------------------------------------ */
/* Ingest                                                             */
/* ------------------------------------------------------------------ */

export type SyncResult = {
  pages: number;
  fetched: number;
  written: number;
  skipped: number;
  reachedSince: boolean;
  error?: string;
};

export async function syncWallet(
  wallet: string,
  opts: { sinceDays?: number; maxPages?: number } = {},
): Promise<SyncResult> {
  const sinceDays = opts.sinceDays ?? 90;
  const maxPages = opts.maxPages ?? 4;
  const cutoff = Date.now() - sinceDays * 86_400_000;

  // Existing ids for this wallet, so a re-sync writes only what is new. This is
  // the difference between a sync loop and a credit fire.
  const seen = new Set(
    (await allLedgerLines(400))
      .map(decodeSpend)
      .filter((s): s is SpendLine => Boolean(s))
      .filter((s) => s.wallet === wallet)
      .map((s) => s.id),
  );

  let after: string | null = null;
  let pages = 0;
  let fetched = 0;
  let written = 0;
  let skipped = 0;
  let reachedSince = false;
  let error: string | undefined;
  const pending: SpendLine[] = [];

  for (let i = 0; i < maxPages; i++) {
    let page;
    try {
      page = await historyPage(wallet, 20, after);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      break;
    }

    pages += 1;
    fetched += page.transactions.length;

    for (const line of extractSpends(wallet, page.transactions)) {
      if (seen.has(line.id)) {
        skipped += 1;
        continue;
      }
      seen.add(line.id);
      pending.push(line);
    }

    const oldest = page.transactions.reduce<string | null>((acc, tx) => {
      const t = tx.effects?.timestamp;
      if (!t) return acc;
      return !acc || t < acc ? t : acc;
    }, null);
    if (oldest && Date.parse(oldest) < cutoff) {
      reachedSince = true;
      break;
    }
    if (!page.hasNextPage || !page.endCursor) {
      reachedSince = true;
      break;
    }
    after = page.endCursor;
  }

  // One bulk write at the end, not one write per line: the relayer takes
  // ~20-30s per job, and a function that dies at 60s would silently drop the
  // tail of a wallet's history.
  if (pending.length > 0) {
    try {
      const res = await rememberSpends(pending);
      written = res.written;
      skipped += res.failed;
      if (res.failed > 0) error = error ?? `${res.failed} lines failed to persist`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return { pages, fetched, written, skipped, reachedSince, error };
}

/* ------------------------------------------------------------------ */
/* Read model                                                         */
/* ------------------------------------------------------------------ */

export async function loadLedger(wallet: string): Promise<Ledger> {
  const w = wallet.toLowerCase();
  const [ledgerLines, ruleLines] = await Promise.all([allLedgerLines(400), allRuleLines(200)]);

  const spendLines = ledgerLines
    .map(decodeSpend)
    .filter((s): s is SpendLine => Boolean(s))
    .filter((s) => s.wallet === w);

  const fixes = ledgerLines.map(decodeFix).filter((f): f is FixLine => Boolean(f)).filter((f) => f.wallet === w);
  const pays = ledgerLines.map(decodePay).filter((p): p is PayLine => Boolean(p)).filter((p) => p.wallet === w);
  const rules = ruleLines.map(decodeRule).filter((r): r is RuleLine => Boolean(r)).filter((r) => r.wallet === w);
  const budgets = ruleLines
    .map(decodeBudget)
    .filter((b): b is BudgetLine => Boolean(b))
    .filter((b) => b.wallet === w);

  // Latest fix per spend line wins.
  const fixById = new Map<string, FixLine>();
  for (const f of fixes.sort((a, b) => (a.at < b.at ? -1 : 1))) fixById.set(f.id, f);

  const rulesAfter = rules;
  // "Before" = rules that existed before the first correction. Approximated
  // honestly: a rule created at the same instant as the first fix is excluded.
  const firstFix = fixes.length ? fixes.map((f) => f.at).sort()[0] : null;
  const rulesBefore = firstFix ? rules.filter((r) => r.at < firstFix) : [];

  const spends: SpendRow[] = spendLines.map((s) => {
    const fix = fixById.get(s.id);
    if (fix) {
      return {
        ...s,
        category: fix.category,
        original: s.category,
        by: "user",
        confidence: 1,
        label: fix.label ?? s.label,
        corrected: true,
      };
    }
    const d = decide({
      to: s.to,
      amount: s.amount,
      wallet: w,
      rules,
      label: s.label,
      fallback: s.symbol === "SUI" && s.to === "—" ? "Fees" : "Uncategorized",
    });
    // A fee is a fact, not an inference: the wallet lost coin and nobody gained
    // any. Reporting confidence 0 there would understate what the app knows.
    const feeLike = s.to === "—" && d.category === "Fees";
    return {
      ...s,
      category: d.category,
      original: null,
      by: d.by,
      confidence: feeLike ? 1 : d.confidence,
      label: d.label ?? s.label,
      corrected: false,
    };
  });

  spends.sort((a, b) => (a.at < b.at ? 1 : -1));

  const months = summarise(spends);
  const learning = holdoutScore(
    spends.map((s) => ({
      wallet: w,
      to: s.to,
      amount: s.amount,
      category: s.category,
      corrected: s.corrected,
    })),
    rulesBefore,
    rulesAfter,
  );

  return {
    wallet: w,
    spends,
    pays,
    rules: rulesFor(w, rules),
    budgets,
    totals: {
      rows: spends.length,
      corrected: spends.filter((s) => s.corrected).length,
      uncategorized: spends.filter((s) => s.category === "Uncategorized").length,
      learnedRules: rulesFor(w, rules).length,
      memories: ledgerLines.length + ruleLines.length,
    },
    months,
    learning,
  };
}

function summarise(spends: SpendRow[]): Ledger["months"] {
  const byMonth = new Map<string, SpendRow[]>();
  for (const s of spends) {
    const month = s.at.slice(0, 7) || "unknown";
    const list = byMonth.get(month) ?? [];
    list.push(s);
    byMonth.set(month, list);
  }

  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, rows]) => {
      const total = rows.reduce((n, r) => n + r.amount, 0);
      const cat = new Map<string, number>();
      for (const r of rows) cat.set(r.category, (cat.get(r.category) ?? 0) + r.amount);
      const byCategory = [...cat.entries()]
        .map(([category, amount]) => ({
          category,
          amount: round(amount, 4),
          share: total > 0 ? amount / total : 0,
        }))
        .sort((a, b) => b.amount - a.amount);
      return { month, total: round(total, 4), symbol: rows[0]?.symbol ?? "SUI", byCategory };
    });
}

/* ------------------------------------------------------------------ */
/* Correction                                                         */
/* ------------------------------------------------------------------ */

/**
 * One tap. Three writes, in this order, and the order is the point:
 *   1. the fix, so the ledger reflects the user immediately
 *   2. the rule, so future spends of that merchant inherit it
 *   3. nothing else — totals are recomputed, never patched
 */
export async function correctSpend(opts: {
  wallet: string;
  id: string;
  category: Category;
  label?: string;
}): Promise<{ fixBlob: string; ruleBlob: string | null; evidence: number }> {
  const w = opts.wallet.toLowerCase();
  const at = new Date().toISOString();

  const lines = await allLedgerLines(400);
  const spend = lines
    .map(decodeSpend)
    .filter((s): s is SpendLine => Boolean(s))
    .find((s) => s.wallet === w && s.id === opts.id);
  if (!spend) throw new Error(`no spend ${opts.id} for this wallet`);

  const fix = await rememberFix({ wallet: w, id: opts.id, category: opts.category, label: opts.label, at });

  const fixes = lines
    .map(decodeFix)
    .filter((f): f is FixLine => f !== null)
    .filter((f) => f.wallet === w && f.id === opts.id);

  const already = fixes.some((f) => f.category === opts.category);
  // Evidence counts distinct corrections on this line, so a merchant corrected
  // once is a weak rule and the same merchant corrected four times is strong.
  const evidence = Math.max(1, new Set(fixes.map((f) => f.category)).size + (already ? 0 : 1));

  /**
   * A fee has no counterparty, so there is nothing to generalise: "—" is not an
   * address and a rule keyed on it would relabel every gas line in the ledger
   * from one correction. That is the bug this guard exists to prevent — a fee
   * correction stays local to the line it was made on.
   */
  const addressless = !spend.to || spend.to === "—";
  if (addressless) {
    return { fixBlob: fix.blobId, ruleBlob: null, evidence };
  }

  const rule = await rememberRule({
    wallet: w,
    target: spend.to,
    category: opts.category,
    label: opts.label ?? spend.label,
    evidence,
    at,
  });

  return { fixBlob: fix.blobId, ruleBlob: rule.blobId, evidence };
}
