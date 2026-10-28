"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SpendRow = {
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

type Ledger = {
  wallet: string;
  spends: SpendRow[];
  pays: Array<{ digest: string; amount: number; symbol: string; to: string; for: string; at: string }>;
  rules: Array<{ target: string; category: string; label?: string; evidence: number; at: string }>;
  budgets: Array<{ category: string; monthly: number; symbol: string }>;
  totals: { rows: number; corrected: number; uncategorized: number; learnedRules: number; memories: number };
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

type TatumState = { credits: number; calls: number; cap: number; remaining: number };

const CATEGORIES = [
  "Food",
  "Transport",
  "Groceries",
  "Subscriptions",
  "Shopping",
  "Bills",
  "Fees",
  "Transfers",
  "Uncategorized",
];

const CAT_COLOR: Record<string, string> = {
  Food: "#e0a63a",
  Transport: "#4ea3ff",
  Groceries: "#35c77a",
  Subscriptions: "#b07cff",
  Shopping: "#ff7ab8",
  Bills: "#ff8a5c",
  Fees: "#6b7385",
  Transfers: "#5fd0c5",
  Uncategorized: "#5a6270",
};

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function fmt(amount: number, symbol: string) {
  const dp = amount >= 1 ? 2 : amount >= 0.01 ? 4 : 6;
  return `${amount.toFixed(dp)} ${symbol}`;
}

function when(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function Page() {
  const [input, setInput] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [tatum, setTatum] = useState<TatumState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (w: string) => {
    const res = await fetch(`/api/ledger?wallet=${w}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "ledger failed");
    setLedger(json.ledger);
    setTatum(json.tatum);
    setWallet(w);
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("wallet");
    if (fromUrl) {
      setInput(fromUrl);
      load(fromUrl.toLowerCase()).catch((e) => setNotice(String(e.message ?? e)));
    }
  }, [load]);

  const sync = async () => {
    const w = input.trim().toLowerCase();
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
      const bits = [
        `${json.written} new ${json.written === 1 ? "line" : "lines"}`,
        `${json.pages} Tatum ${json.pages === 1 ? "page" : "pages"}`,
        json.skipped ? `${json.skipped} already in memory` : null,
        json.error ? `stopped: ${json.error}` : null,
      ].filter(Boolean);
      setNotice(bits.join(" · "));
      window.history.replaceState(null, "", `?wallet=${w}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fix = async (row: SpendRow, category: string, label?: string) => {
    if (!wallet) return;
    setBusy(row.id);
    setNotice(null);
    try {
      const res = await fetch("/api/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, id: row.id, category, label }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "correction failed");
      await load(wallet);
      setOpen(null);
      setNotice(`Remembered. Rule evidence ${json.evidence} — future payments to this merchant inherit "${category}".`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const askAgent = async (row: SpendRow) => {
    if (!wallet) return;
    setBusy(row.id);
    setNotice(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, id: row.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "agent failed");
      await load(wallet);
      if (json.status === "labelled") {
        setNotice(
          `Agent paid 0.01 USDC on Sui and learned "${json.profile.label}" (${json.profile.category}). ` +
            (json.digest ? `Settlement ${json.digest.slice(0, 12)}…` : ""),
        );
      } else if (json.status === "unfunded") {
        setNotice("Agent wallet has no USDC on Sui yet, so no payment was attempted and nothing was written.");
      } else if (json.status === "unknown") {
        setNotice("The merchant directory has no label for this address yet — the agent did not pay for an empty answer.");
      } else {
        setNotice(json.error ?? "agent could not finish");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const month = ledger?.months[0];
  const maxCat = useMemo(
    () => (month ? Math.max(...month.byCategory.map((c) => c.amount), 0.000001) : 1),
    [month],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">RecallSpend</h1>
          <span className="chip mono text-[10px]" style={{ color: "#9d8cff", borderColor: "#2c2745" }}>
            SUI · MAINNET
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          A spend tracker with no database. Your ledger, your merchant rules and your budgets are
          lines in Walrus Memory, so a correction made once stays made — and an agent can pay a
          fraction of a cent on Sui to name a merchant it has never seen.
        </p>
      </header>

      <section className="panel mb-6 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sync()}
            placeholder="Paste a Sui wallet address (0x… 64 hex)"
            className="mono flex-1"
            spellCheck={false}
          />
          <button className="btn btn-primary" onClick={sync} disabled={busy === "sync"}>
            {busy === "sync" ? "Reading chain…" : wallet ? "Sync again" : "Read my spending"}
          </button>
        </div>
        {notice && (
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
            {notice}
          </p>
        )}
        {wallet && (
          <p className="mono mt-2 text-[11px]" style={{ color: "#5c6573" }}>
            {wallet} · ledger read from Walrus Memory{tatum ? ` · ${tatum.credits} Tatum credits spent today` : ""}
          </p>
        )}
      </section>

      {!ledger && (
        <section className="panel p-6 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          <p className="mb-3">
            Nothing to show yet. Paste any Sui address above; the first read costs a handful of
            Tatum credits, and every read after that costs none because the result is memory.
          </p>
          <p>
            The wallet to try: <span className="mono" style={{ color: "var(--ink)" }}>
              0x8fbd10bdc30b5a998bdfbf26d7bae87314b4bdeaa4be53dbbfc5ca88f84e37ca
            </span>
          </p>
        </section>
      )}

      {ledger && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Memories" value={String(ledger.totals.memories)} hint="Walrus, mainnet" />
            <Stat label="Lines in ledger" value={String(ledger.totals.rows)} hint={`${ledger.totals.corrected} corrected by you`} />
            <Stat
              label="Generalisation"
              value={`${pct(ledger.learning.before)} → ${pct(ledger.learning.after)}`}
              hint={`${ledger.learning.heldOut} held-out lines · ${ledger.learning.labelled} corrected`}
              accent
            />
            <Stat
              label="Tatum credits left"
              value={tatum ? String(tatum.remaining) : "—"}
              hint={tatum ? `${tatum.calls} calls today · cap ${tatum.cap}` : ""}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
                <h2 className="text-sm font-medium">Spending</h2>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {ledger.totals.uncategorized} uncategorised
                </span>
              </div>

              {ledger.spends.length === 0 && (
                <p className="p-4 text-sm" style={{ color: "var(--muted)" }}>
                  No outflows in this window. Only successful transactions are counted.
                </p>
              )}

              <ul>
                {ledger.spends.slice(0, 40).map((row) => (
                  <li key={row.id} className="border-b px-4 py-3 last:border-0" style={{ borderColor: "#14181e" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{row.label ?? short(row.to)}</span>
                          <span
                            className="chip mono"
                            style={{ color: CAT_COLOR[row.category] ?? "#8b93a1", borderColor: "var(--line)" }}
                          >
                            {row.category}
                          </span>
                          {row.corrected && row.original && (
                            <span className="text-[10px]" style={{ color: "#5c6573" }}>
                              was {row.original}
                            </span>
                          )}
                          {row.by === "model" && (
                            <span className="text-[10px]" style={{ color: "#9d8cff" }}>paid lookup</span>
                          )}
                        </div>
                        <div className="mono mt-1 text-[11px]" style={{ color: "#5c6573" }}>
                          {when(row.at)} · to {short(row.to)} ·{" "}
                          {row.by === "user"
                            ? "you"
                            : row.by === "model"
                              ? `agent · ${pct(row.confidence)}`
                              : row.confidence > 0
                                ? `rule · ${pct(row.confidence)}`
                                : "no rule"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="mono text-sm">{fmt(row.amount, row.symbol)}</div>
                        <div className="mt-1 flex justify-end gap-1">
                          <button
                            className="btn px-2 py-1 text-[11px]"
                            onClick={() => setOpen(open === row.id ? null : row.id)}
                          >
                            {open === row.id ? "close" : "fix"}
                          </button>
                          {row.category === "Uncategorized" && (
                            <button
                              className="btn px-2 py-1 text-[11px]"
                              onClick={() => askAgent(row)}
                              disabled={busy === row.id}
                              title="Agent pays 0.01 USDC on Sui for a merchant label"
                            >
                              {busy === row.id ? "paying…" : "ask agent"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {open === row.id && <FixPanel row={row} busy={busy === row.id} onSave={fix} />}
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex flex-col gap-6">
              <section className="panel p-4">
                <h2 className="mb-1 text-sm font-medium">What memory bought</h2>
                <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  Scored only on lines you did <em>not</em> correct, from merchants you did label.
                  Scoring corrected lines would be circular — the fix is the answer. Left is the
                  ruleset before your first correction, right is now.
                </p>

                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tracking-tight">
                    {pct(ledger.learning.before)}
                    <span style={{ color: "#4b5361" }}> → </span>
                    {pct(ledger.learning.after)}
                  </span>
                  <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
                    {ledger.learning.correctAfter}/{ledger.learning.heldOut} held-out
                  </span>
                </div>
                <div className="bar mb-4">
                  <span style={{ width: `${Math.max(2, ledger.learning.after * 100)}%` }} />
                </div>

                {ledger.rules.length === 0 ? (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    No rules yet. Correct one payment and the rule appears here with its evidence
                    count, readable as a line of memory.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {ledger.rules.slice(0, 6).map((r) => (
                      <li key={`${r.target}-${r.category}`} className="text-xs leading-relaxed">
                        <span className="mono" style={{ color: "#9d8cff" }}>
                          {r.label ?? short(r.target)}
                        </span>
                        <span style={{ color: "var(--muted)" }}> → </span>
                        <span>{r.category}</span>
                        <span className="mono ml-2 text-[10px]" style={{ color: "#5c6573" }}>
                          evidence {r.evidence}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel p-4">
                <h2 className="mb-3 text-sm font-medium">By category{month ? ` · ${month.month}` : ""}</h2>
                {!month || month.byCategory.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Nothing counted yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {month.byCategory.map((c) => (
                      <li key={c.category}>
                        <div className="mb-1 flex justify-between text-[11px]">
                          <span>{c.category}</span>
                          <span className="mono" style={{ color: "var(--muted)" }}>
                            {fmt(c.amount, month.symbol)}
                          </span>
                        </div>
                        <div className="bar">
                          <span
                            style={{
                              width: `${Math.max(2, (c.amount / maxCat) * 100)}%`,
                              background: CAT_COLOR[c.category] ?? "#7c5cff",
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel p-4">
                <h2 className="mb-1 text-sm font-medium">Agent payments</h2>
                <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  Each line is a real USDC transfer on Sui mainnet, paid by this app&apos;s agent to
                  buy a merchant label it could not derive. The seller is this app&apos;s own
                  directory — stated plainly, not implied.
                </p>
                {ledger.pays.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    No agent payments yet. Use <span className="mono">ask agent</span> on an
                    uncategorised line.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {ledger.pays.map((p) => (
                      <li key={p.digest + p.at} className="mono text-[11px] leading-relaxed">
                        <span style={{ color: "#35c77a" }}>{p.amount} {p.symbol}</span>
                        <span style={{ color: "var(--muted)" }}> · {p.for}</span>
                        <br />
                        <a
                          href={`https://suiscan.xyz/mainnet/tx/${p.digest}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#6f8dff" }}
                        >
                          {p.digest.slice(0, 24)}…
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}

      <footer className="mt-10 text-[11px] leading-relaxed" style={{ color: "#4b5361" }}>
        Ledger lines are immutable. A correction is appended, never written over the observation, so
        the app can always show what it thought before you taught it otherwise. Tatum Sui GraphQL is
        used once per wallet sync; page reads never touch it.
      </footer>
    </main>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="panel p-3.5">
      <div className="text-[11px]" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight" style={{ color: accent ? "#9d8cff" : "var(--ink)" }}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px]" style={{ color: "#5c6573" }}>{hint}</div>
    </div>
  );
}

function FixPanel({
  row,
  busy,
  onSave,
}: {
  row: SpendRow;
  busy: boolean;
  onSave: (row: SpendRow, category: string, label?: string) => void;
}) {
  const [category, setCategory] = useState(row.category === "Uncategorized" ? "Food" : row.category);
  const [label, setLabel] = useState(row.label ?? "");

  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: "#0b0d11", border: "1px solid var(--line)" }}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-40">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Merchant name (optional)"
          className="flex-1"
        />
        <button
          className="btn btn-primary"
          onClick={() => onSave(row, category, label.trim() || undefined)}
          disabled={busy}
        >
          {busy ? "writing…" : "Remember"}
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#5c6573" }}>
        Writes two lines to Walrus Memory: the correction, and a rule for{" "}
        <span className="mono">{short(row.to)}</span>. Nothing is overwritten.
      </p>
    </div>
  );
}
