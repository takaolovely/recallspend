"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  BrainCircuit,
  Receipt,
  Sparkles,
  Wallet,
  Info,
} from "lucide-react";

import { TopNav } from "@/components/dashboard/top-nav";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { TransactionRow } from "@/components/dashboard/transaction-row";
import { LearnedRuleItem } from "@/components/dashboard/learned-rule-item";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AgentPanel } from "@/components/dashboard/agent-panel";
import { AgentPayments } from "@/components/dashboard/agent-payments";
import { CorrectDialog } from "@/components/dashboard/correct-dialog";
import { BuyProgress, type BuyStep } from "@/components/dashboard/buy-progress";
import { RuleSkeleton, TransactionSkeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatAmount, pct, shortAddress } from "@/lib/utils";
import type { AgentInfo, Balance, Ledger, SpendRow } from "@/lib/types";

/**
 * A wallet with real, unglamorous history: gas lines and three outgoing
 * transfers to addresses nobody has named. Those three rows are the whole demo —
 * they are what the agent pays to label. Kept separate from the agent's own
 * wallet on purpose, so the payer address in the panel is visibly another
 * account and not the app paying itself.
 */
const DEMO_WALLET = "0xf42e7b60311d13a62c66afa1b8a2b916092572c0be15af6ea2cba931ec83d8ed";

/**
 * Reserve floor, in USDC. This is not anti-abuse; it is a do-not-run-dry guard.
 * The demo only works while there are unbought merchants left to click, so the
 * last 0.08 USDC (eight lookups) is out of reach of the button. Correcting is
 * unaffected, which is the honest answer anyway when the user knows the merchant.
 */
const RESERVE_USDC = 0.08;

type AgentResponse = {
  status: "labelled" | "no_label" | "already" | "unfunded" | "error";
  price?: string;
  profile?: { label?: string | null; category?: string | null; source?: string };
  digest?: string;
  error?: string;
};

export default function Page() {
  const [input, setInput] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  /** Which row is mid-purchase, and which of the three real stages it is in. */
  const [buyStage, setBuyStage] = useState<{ id: string; step: BuyStep; digest?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [target, setTarget] = useState<SpendRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  /** True while the agent cannot afford a lookup without eating the reserve. */
  const lowReserve = agent ? agent.usdc < RESERVE_USDC : false;

  const loadAgent = useCallback(async (fresh = false) => {
    try {
      const res = await fetch(`/api/agent/balance${fresh ? "?fresh=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      setAgent((await res.json()) as AgentInfo);
    } catch {
      // The panel renders an em dash rather than a wrong number.
    }
  }, []);

  const load = useCallback(async (w: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ledger?wallet=${w}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ledger failed");
      setLedger(json.ledger);
      setBalances(json.balances ?? []);
      setWallet(w);
    } finally {
      // A slow recall must not look like an empty account.
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("wallet") ?? DEMO_WALLET;
    setInput(fromUrl);
    load(fromUrl.toLowerCase()).catch((e) => setNotice(String(e.message ?? e)));
    void loadAgent();
  }, [load, loadAgent]);

  const sync = async (raw?: string) => {
    const w = (raw ?? input).trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(w)) {
      setNotice("That is not a Sui address. It should start with 0x and be 64 hex characters.");
      return;
    }
    setBusy("sync");
    setNotice(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: w, sinceDays: 120 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "sync failed");
      await load(w);
      // Refresh the payer balance too: a sync is the moment the reader expects
      // every number on the page to be current, including the reserve state.
      void loadAgent(true);
      setNotice(
        [
          `${json.written} new ${json.written === 1 ? "line" : "lines"}`,
          `${json.pages} Tatum ${json.pages === 1 ? "page" : "pages"}`,
          json.skipped ? `${json.skipped} already in memory` : null,
          json.error ? `stopped: ${json.error}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      window.history.replaceState(null, "", `?wallet=${w}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async (category: string, label?: string) => {
    if (!wallet || !target) return;
    setBusy(target.id);
    try {
      const res = await fetch("/api/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, id: target.id, category, label }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "correction failed");
      setDialogOpen(false);
      await load(wallet);
      setNotice(
        json.ruleBlob
          ? `Remembered. Rule evidence ${json.evidence} — future payments to this merchant inherit “${category}”.`
          : `Remembered as a one-off correction for this line.`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /**
   * One click, three things on the server: free preflight, the 0.01 USDC
   * payment on Sui, then two memory writes. The UI only reports what the server
   * actually did — including "nothing was charged" when there is nothing to buy.
   */
  const buyLabel = async (row: SpendRow) => {
    if (!wallet) return;

    /**
     * Reserve guard runs before anything else. The agent wallet holds real
     * money and this page has no login, but the realistic failure is not abuse:
     * it is the demo running dry halfway through judging. Below the floor the
     * button stops; correcting stays open because it costs nothing.
     */
    if (lowReserve) {
      setNotice(
        `Buying is paused: the agent wallet holds ${agent?.usdc.toFixed(4) ?? "0"} USDC, below the ${RESERVE_USDC.toFixed(2)} USDC reserve kept for this demo. Correcting a merchant is still free.`,
      );
      return;
    }

    setBuying(row.id);
    setBuyStage({ id: row.id, step: 1 });
    setNotice(null);
    const pendingKey = `recallspend:pending:${wallet}:${row.id}`;
    try {
      /**
       * Resume rather than re-charge. If the payment settled but the memory write
       * died, the digest is still on this device, so the next click finishes the
       * job for 0 rather than paying 0.01 USDC again.
       */
      let digest = localStorage.getItem(pendingKey) ?? "";

      if (digest) {
        // Resuming past the payment. Saying "paying" again would be a lie.
        setBuyStage({ id: row.id, step: 3, digest });
      }

      if (!digest) {
        /**
         * Free preflight, before any money moves. This is what makes step 2
         * honest: the label is "Paying" only after the seller has confirmed an
         * answer exists, so no USDC is committed to an empty lookup.
         */
        const pre = await fetch(`/api/enrich/preview?address=${encodeURIComponent(row.to)}`, {
          cache: "no-store",
        });
        const known = pre.ok ? ((await pre.json()) as { known?: boolean }) : { known: true };
        if (known.known === false) {
          setNotice("Nothing was charged. The seller has no label for this merchant.");
          return;
        }

        setBuyStage({ id: row.id, step: 2 });
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet, id: row.id }),
        });
        const json = (await res.json()) as AgentResponse & { spendId?: string };
        if (!res.ok) throw new Error(json.error ?? "agent failed");

        if (json.status === "already") {
          await load(wallet);
          await loadAgent(true);
          setNotice("This merchant was already bought — no second charge.");
          return;
        }

        if (json.status !== "labelled" || !json.digest) {
          setNotice(
            json.status === "unfunded"
              ? `Agent wallet is out of USDC, so nothing was charged. ${json.error ?? ""}`.trim()
              : `Nothing was charged. ${json.error ?? "The seller has no label for this merchant."}`,
          );
          return;
        }

        digest = json.digest;
        localStorage.setItem(pendingKey, digest);
        setBuyStage({ id: row.id, step: 3, digest });
        setNotice(
          `Paid ${json.price ?? "0.01"} USDC → “${json.profile?.label}”. Writing it to Walrus Memory…`,
        );
      }

      // STEP 2: prove the digest, then write both lines.
      const rec = await fetch("/api/agent/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, id: row.id, digest }),
      });
      const saved = (await rec.json()) as AgentResponse;
      if (!rec.ok) throw new Error(saved.error ?? "could not write to memory");

      localStorage.removeItem(pendingKey);
      await load(wallet);
      await loadAgent(true);

      setNotice(
        saved.status === "already"
          ? `Already remembered. Settlement ${shortAddress(digest, 6, 4)}.`
          : `Agent paid ${saved.price ?? "0.01"} USDC → “${saved.profile?.label}” (${saved.profile?.source ?? "seller"}) → written to Walrus Memory. Settlement ${shortAddress(digest, 6, 4)}.`,
      );
      window.history.replaceState(null, "", `?wallet=${wallet}`);
    } catch (e) {
      /**
       * Memory is the source of truth, so re-read it before reporting failure.
       * The payment may have settled and the write may have landed even though
       * this request died on the way back.
       */
      let recovered = false;
      try {
        const res = await fetch(`/api/ledger?wallet=${wallet}`, { cache: "no-store" });
        const json = await res.json();
        const hit = (json.ledger?.spends ?? []).find((s: SpendRow) => s.id === row.id);
        if (hit?.label) {
          localStorage.removeItem(pendingKey);
          setLedger(json.ledger);
          setBalances(json.balances ?? []);
          setNotice(
            `Agent paid and the answer “${hit.label}” is in Walrus Memory. The request was slow, so this was read back from memory rather than from the call.`,
          );
          await loadAgent(true);
          recovered = true;
        }
      } catch {
        /* fall through to the real error */
      }
      if (!recovered) {
        setNotice(
          localStorage.getItem(pendingKey)
            ? `${e instanceof Error ? e.message : String(e)} — the payment is recorded on this device, so clicking again will finish writing it without paying twice.`
            : e instanceof Error
              ? e.message
              : String(e),
        );
      }
    } finally {
      setBuying(null);
      setBuyStage(null);
    }
  };

  const month = ledger?.months[0];
  const usdc = balances.find((b) => b.symbol === "USDC");
  const sui = balances.find((b) => b.symbol === "SUI");
  const balanceValue = usdc ? usdc.amount.toFixed(2) : sui ? sui.amount.toFixed(2) : "0.00";
  const balanceSymbol = usdc ? "USDC" : sui ? "SUI" : "USDC";

  const coveredByRule = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of ledger?.spends ?? []) {
      if (s.by === "rule" && !s.corrected) map.set(s.to, (map.get(s.to) ?? 0) + 1);
    }
    return map;
  }, [ledger]);

  /** target address → USDC spent buying its label. */
  const paidByTarget = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of ledger?.pays ?? []) {
      if (p.target) map.set(p.target.toLowerCase(), p.amount);
    }
    return map;
  }, [ledger]);

  const maxEvidence = Math.max(1, ...(ledger?.rules.map((r) => r.evidence) ?? [1]));

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TopNav wallet={wallet} connecting={busy === "sync"} onConnect={() => sync()} />

      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        {/* Page heading + account control */}
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              {wallet
                ? "Your ledger lives in Walrus Memory, not in our database."
                : "Connect a Sui wallet to read its spending history."}
            </p>
          </div>

          <div className="flex w-full max-w-md items-center gap-2">
            <div className="relative flex-1">
              <Wallet className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sync()}
                placeholder="0x… Sui address"
                spellCheck={false}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 font-mono text-[12px] text-zinc-900 outline-none transition-colors placeholder:font-sans placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <Button variant="emerald" className="h-10" onClick={() => sync()} disabled={busy === "sync"}>
              {busy === "sync" ? "Reading…" : "Sync"}
            </Button>
          </div>
        </div>

        {notice && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
            <Info className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
            {notice}
          </div>
        )}

        {buyStage && (
          <BuyProgress
            step={buyStage.step}
            digest={buyStage.digest}
            price={agent?.price ?? "0.01"}
          />
        )}

        {/* Summary row */}
        <div className="mb-8 grid gap-5 sm:grid-cols-3">
          <SummaryCard
            label="Balance"
            value={`${balanceValue} ${balanceSymbol}`}
            loading={loading}
            hint={loading ? "reading memory…" : wallet ? shortAddress(wallet, 8, 6) : "no wallet connected"}
            icon={Wallet}
            className="enter enter-1"
          />
          <SummaryCard
            label="Monthly spend"
            value={month ? formatAmount(month.total, month.symbol) : "—"}
            loading={loading}
            hint={
              month
                ? `${ledger?.totals.rows ?? 0} lines · ${month.month}`
                : "nothing recorded yet"
            }
            icon={ArrowDownRight}
            className="enter enter-2"
          />
          <SummaryCard
            label="Learned rules"
            value={String(ledger?.totals.learnedRules ?? 0)}
            loading={loading}
            hint={
              ledger?.pays.some((p) => !p.voided)
                ? `${ledger.pays.filter((p) => !p.voided).length} bought by the agent`
                : ledger?.pays.length
                  ? "retracted: the label was fabricated"
                  : ledger?.totals.corrected
                    ? `from ${ledger.totals.corrected} correction${ledger.totals.corrected === 1 ? "" : "s"}`
                    : "correct or buy a label"
            }
            icon={BrainCircuit}
            tone="emerald"
            className="enter enter-3"
          />
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Feed */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200/80 px-6 py-5 dark:border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Receipt className="size-4 text-zinc-500 dark:text-zinc-400" />
                <h2 className="text-sm font-semibold">Transactions</h2>
                <Badge variant="muted">{ledger?.spends.length ?? 0}</Badge>
              </div>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {ledger?.totals.uncategorized ?? 0} uncategorised
              </span>
            </div>

            {lowReserve && (
              <div className="border-b border-amber-200/70 bg-amber-50/70 px-5 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300">
                Reserve floor reached: the agent wallet holds{" "}
                <span className="font-mono tabular-nums">{agent?.usdc.toFixed(4)} USDC</span>, below the{" "}
                {RESERVE_USDC.toFixed(2)} USDC kept aside so this demo still has labels to sell.{" "}
                <span className="font-medium">“Get label” is disabled.</span> Correcting a merchant is
                free and still works.
              </div>
            )}

            {loading ? (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {Array.from({ length: 6 }).map((_, i) => (
                  <TransactionSkeleton key={i} />
                ))}
              </div>
            ) : !ledger ? (
              <div className="p-5">
                <EmptyState
                  icon={Wallet}
                  title="No ledger yet"
                  description="Paste a Sui address above and sync once. Every read after that is served from memory, so this page never spends Tatum credits."
                >
                  <Button variant="outline" onClick={() => setInput(DEMO_WALLET)}>
                    Use the demo wallet
                  </Button>
                </EmptyState>
              </div>
            ) : ledger.spends.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={Receipt}
                  title="No outflows in this window"
                  description="Only successful transactions are counted. Widen the window or try a wallet that has sent a payment."
                />
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {ledger.spends.slice(0, 40).map((row) => (
                  <TransactionRow
                    key={row.id}
                    row={row}
                    busy={busy === row.id}
                    buying={buying === row.id}
                    stage={buyStage?.id === row.id ? buyStage.step : null}
                    pausedReason={
                      lowReserve
                        ? `Buying paused: the agent wallet is below the ${RESERVE_USDC.toFixed(2)} USDC reserve kept for this demo. Correcting is free and still works.`
                        : null
                    }
                    onBuy={buyLabel}
                    onCorrect={(r) => {
                      setTarget(r);
                      setDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Rules + agent sidebar */}
          <div className="flex flex-col gap-6 lg:sticky lg:top-24">
            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200/80 px-6 py-5 dark:border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <Sparkles className="size-3.5" />
                  </span>
                  <h2 className="text-sm font-semibold">Learned rules</h2>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Each rule is a line in Walrus Memory. Evidence is how many of your corrections
                  agreed; a paid rule shows what the agent spent instead.
                </p>
              </div>

              <div className="p-4">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <RuleSkeleton key={i} />
                    ))}
                  </div>
                ) : ledger && ledger.rules.length > 0 ? (
                  <div className="space-y-3">
                    {ledger.rules.slice(0, 8).map((r) => (
                      <LearnedRuleItem
                        key={`${r.target}-${r.category}`}
                        rule={r}
                        covered={coveredByRule.get(r.target) ?? 0}
                        maxEvidence={maxEvidence}
                        paid={paidByTarget.get(r.target.toLowerCase()) ?? null}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={BrainCircuit}
                    title="Nothing learned yet"
                    description="Correct one payment and the rule appears here with the evidence behind it. Or let the agent buy a merchant name."
                  />
                )}
              </div>

              <div className="border-t border-zinc-200/80 px-6 py-5 dark:border-zinc-800/80">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Generalisation
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {pct(ledger?.learning.before ?? 0)}{" "}
                    <span className="text-zinc-400">→</span>{" "}
                    {pct(ledger?.learning.after ?? 0)}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Scored only on lines you never corrected, from merchants you did label.{" "}
                  {ledger?.learning.heldOut ?? 0} held-out line
                  {(ledger?.learning.heldOut ?? 0) === 1 ? "" : "s"}.
                </p>
              </div>
            </Card>

            <AgentPayments
              agent={agent}
              pays={ledger?.pays ?? []}
              rules={ledger?.rules ?? []}
              reserve={RESERVE_USDC}
            />
          </div>
        </div>

        <footer className="mt-12 flex flex-col gap-1.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          <p>
            Ledger lines are immutable. A correction is appended, never written over the
            observation, so the app can always show what it thought before you taught it otherwise.
          </p>
          <p>Tatum Sui GraphQL is used once per sync; page reads never touch it.</p>
        </footer>
      </main>

      <CorrectDialog
        row={target}
        open={dialogOpen}
        busy={busy === target?.id}
        onOpenChange={setDialogOpen}
        onSave={save}
      />
      <AgentPanel wallet={wallet} />
    </div>
  );
}
