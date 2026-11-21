"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProposalCard } from "@/lib/agent/tools";
import { formatPeso } from "@/lib/schedule";
import { Dink } from "./Dink";

type Msg = { role: "user" | "assistant"; content: string; cards?: ProposalCard[] };

const CHIPS = ["Tonight after 7", "2 hours this Saturday", "How do I pay?", "Open play?"];
const GREETING = "Hi! I'm Dink. Tell me when you want to play and I'll find open courts.";
const MAX_CHARS = 500;

/** The "Ask Dink" chat panel: full screen on phones, a side panel on larger screens. */
export function DinkChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [ended, setEnded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function send(text: string) {
    const content = text.trim().slice(0, MAX_CHARS);
    if (!content || pending || ended) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content: c }) => ({ role, content: c })) }),
      });
      const data = (await res.json()) as { reply: string; cards?: ProposalCard[]; limited?: boolean };
      setMessages([...next, { role: "assistant", content: data.reply, cards: data.cards }]);
      if (data.limited) setEnded(true);
    } catch {
      setMessages([...next, { role: "assistant", content: "Dink couldn't answer just now. You can still book on the Book a court page." }]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  const restart = () => {
    setMessages([]);
    setEnded(false);
    inputRef.current?.focus();
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="dink-chat-title"
      className="fixed inset-0 z-50 flex flex-col bg-paper sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[min(620px,calc(100dvh-2.5rem))] sm:w-[380px] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-kitchen-light sm:shadow-2xl"
    >
      <header className="flex items-center gap-3 bg-court-deep px-4 py-3 text-white">
        <Dink state={pending ? "think" : "wave"} className="w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="dink-chat-title" className="font-semibold">Ask Dink</h2>
          <p className="text-xs text-white/70">Finds open courts in seconds</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close Ask Dink">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4" aria-live="polite">
        <p className="max-w-[88%] self-start rounded-2xl rounded-bl-md border border-kitchen-light bg-white px-3 py-2 text-sm text-steel">{GREETING}</p>
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-court px-3 py-2 text-sm whitespace-pre-line text-white">
              {m.content}
            </p>
          ) : (
            <div key={i} className="max-w-[92%] self-start rounded-2xl rounded-bl-md border border-kitchen-light bg-white px-3 py-2 text-sm text-steel">
              <p className="whitespace-pre-line">{m.content}</p>
              {m.cards && m.cards.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {m.cards.map((c, j) => (
                    <li key={c.proposalId} className="rounded-xl border border-kitchen p-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold">{c.courtName} · {c.hoursLabel}</p>
                        <p className="font-semibold text-court">{formatPeso(c.total)}</p>
                      </div>
                      <p className="text-xs text-steel/70">{c.dateLabel}</p>
                      <Link
                        href={c.href}
                        onClick={onClose}
                        className={`mt-2 block rounded-full px-3 py-1.5 text-center text-sm font-semibold ${j === 0 ? "bg-ball text-ball-dark" : "border border-kitchen text-steel hover:border-court"}`}
                      >
                        Book these hours
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
        {pending && (
          <p className="self-start rounded-2xl rounded-bl-md border border-kitchen-light bg-white px-3 py-2 text-sm text-steel/60" role="status">
            Dink is checking the courts…
          </p>
        )}
        {ended && (
          <button type="button" onClick={restart} className="btn-ghost self-center px-4 py-1.5">
            Start a new chat
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-kitchen-light bg-white px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {messages.length === 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {CHIPS.map((c) => (
              <button key={c} type="button" onClick={() => send(c)} className="shrink-0 rounded-full border border-kitchen bg-white px-3 py-1 text-xs font-semibold text-steel hover:border-court">
                {c}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="dink-input" className="sr-only">Message Dink</label>
          <textarea
            id="dink-input"
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={MAX_CHARS}
            disabled={ended}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask about courts, hours, paying…"
            className="input max-h-28 min-h-10 resize-none rounded-2xl"
          />
          <button type="submit" disabled={pending || ended || !input.trim()} className="btn-primary shrink-0 rounded-full px-4">
            Send
          </button>
        </form>
        <p className="text-center text-[11px] text-steel/60">Dink uses an AI service to read your message. Don&apos;t share personal details here.</p>
      </div>
    </section>
  );
}
