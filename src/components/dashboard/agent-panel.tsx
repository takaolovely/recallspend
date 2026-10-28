"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Citation = { kind: string; text: string };
type Message = { role: "user" | "agent"; text: string; citations?: Citation[] };

/**
 * AgentPanel — a collapsible chat that answers from memory, not from a model.
 *
 * Every reply carries the memory lines it was derived from, shown as mono text
 * under the answer. That is the point: the panel is not "ask an AI about your
 * money", it is "ask your memory what it knows and see the line".
 */
export function AgentPanel({ wallet }: { wallet: string | null }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      text: "I read the same memory the ledger is built from. Ask me why a merchant sits in a category, what a category totals, or how many rules you have taught me.",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async (q: string) => {
    if (!q.trim() || !wallet || busy) return;
    const question = q.trim();
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, q: question }),
      });
      const json = await res.json();
      setMessages((m) => [
        ...m,
        res.ok
          ? { role: "agent", text: json.answer, citations: json.citations }
          : { role: "agent", text: json.error ?? "That failed." },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "agent", text: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg",
          "bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200",
          "transition-[transform,opacity,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.97]",
          open && "pointer-events-none scale-95 opacity-0",
        )}
        aria-label="Open agent"
      >
        <MessageCircle className="size-4" />
        Ask memory
      </button>

      <div
        className={cn(
          "fixed bottom-5 right-5 z-40 flex w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl",
          "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
          // Origin-aware: the panel is anchored to the button, so it grows out
          // of that corner. Centre-origin would look like it came from nowhere.
          "origin-bottom-right transition-[transform,opacity] duration-200 ease-[var(--ease-out)]",
          open
            ? "h-[520px] translate-y-0 scale-100 opacity-100"
            : "pointer-events-none h-0 translate-y-2 scale-[0.96] opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Bot className="size-4" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Memory agent</div>
              <div className="text-[11px] text-zinc-500">reads Walrus, cites lines</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close agent">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                  m.role === "user"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                )}
              >
                <p>{m.text}</p>
                {m.citations && m.citations.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
                    {m.citations.slice(0, 3).map((c, j) => (
                      <li
                        key={j}
                        className="truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-500"
                      >
                        {c.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-[11px] text-zinc-400">reading memory…</div>}
          <div ref={endRef} />
        </div>

        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-end gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder={wallet ? "why is Kopi in Food?" : "connect a wallet first"}
              disabled={!wallet || busy}
              className="h-9 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-[13px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <Button
              size="icon"
              variant="emerald"
              onClick={() => send(input)}
              disabled={!wallet || busy || !input.trim()}
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
